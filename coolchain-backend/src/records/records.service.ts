import { Injectable, Logger } from '@nestjs/common';
import { CreateRecordDTO } from './types/dto/CreateRecordDTO';
import { RecordDTO } from './types/dto/RecordDTO';
import { PrismaService } from '../prisma/prisma.service';
import { Record } from './types/Record';
import { ErrorCodes } from '../utils/errors';
import { Prisma } from '@prisma/client';
import { DevicesService } from '../devices/devices.service';
import { getUnixTimeInSeconds } from '../blockchain/blockchain.utils';
import { AuditStatusDTO } from './types/dto/AuditStatusDTO';
import { arePermitFieldsPresent } from './records.utils';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AUDIT_SAFETY_OFFSET } from '../utils/constants';

@Injectable()
export class RecordsService {
  private readonly logger: Logger = new Logger(RecordsService.name);

  constructor(
    private readonly _prismaService: PrismaService,
    private readonly _devicesService: DevicesService,
    private readonly _blockchainService: BlockchainService,
  ) {}

  async storeUnauditedRecord(
    _record: CreateRecordDTO,
  ): Promise<CreateRecordDTO> {
    const auditStatus = await this.getAuditStatus(_record.deviceAddress);
    if (auditStatus.isAuditPending && arePermitFieldsPresent(_record)) {
      throw new Error(ErrorCodes.AUDIT_NOT_AVAILABLE.code);
    }

    try {
      return await this._prismaService.record.create({
        data: {
          deviceAddress: _record.deviceAddress,
          timestamp: _record.timestamp,
          value: _record.value,
          permitDeadline: _record.permitDeadline,
          permitSignature: _record.permitSignature,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating record: ${error.message}`, {
        stack: error.stack,
        device: _record.deviceAddress,
      });
      throw new Error(ErrorCodes.DATABASE_ERROR.code);
    }
  }

  async getUnauditedRecords(_recordNum: number): Promise<Record[]> {
    try {
      return await this._prismaService.record.findMany({
        where: {
          permitDeadline: {
            gt: getUnixTimeInSeconds(),
          },
          events: {
            none: {},
          },
        },
        distinct: ['deviceAddress'],
        orderBy: {
          timestamp: 'asc',
        },
        take: _recordNum,
      });
    } catch (error) {
      this.logger.error(
        `Error retrieving unaudited records: ${error.message}`,
        {
          stack: error.stack,
        },
      );
      throw new Error(ErrorCodes.DATABASE_ERROR.code);
    }
  }

  async getRecordsWithEvents(
    _auditorAddress: string,
    _deviceAddress?: string,
  ): Promise<RecordDTO[] | null> {
    const query: Prisma.RecordFindManyArgs = {
      where: {
        device: {
          auditorAddress: _auditorAddress,
        },
      },
      select: {
        id: true,
        deviceAddress: true,
        timestamp: true,
        value: true,
        permitDeadline: true,
        events: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    };

    if (_deviceAddress) {
      query.where.deviceAddress = _deviceAddress;
    }

    try {
      return await this._prismaService.record.findMany(query);
    } catch (error) {
      this.logger.error(
        `Error retrieving records with events: ${error.message}`,
        {
          stack: error.stack,
          auditor: _auditorAddress,
          device: _deviceAddress ?? null,
        },
      );
      throw new Error(ErrorCodes.DATABASE_ERROR.code);
    }
  }

  async getAuditStatus(_deviceAddress: string): Promise<AuditStatusDTO> {
    if (!_deviceAddress) {
      throw new Error(ErrorCodes.ADDRESS_REQUIRED.code);
    }

    // Check in DB
    const device = await this._devicesService.findDevice(_deviceAddress);
    if (!device) {
      throw new Error(ErrorCodes.DEVICE_NOT_REGISTERED.code);
    }

    // Check in contract: transaction will fail if device is not recorded
    await this._devicesService.checkDeviceInContract(_deviceAddress);

    try {
      // Record without events: pending audit
      const recordWithoutEvents = await this._prismaService.record.findFirst({
        where: {
          permitDeadline: {
            gt: getUnixTimeInSeconds(),
          },
          events: {
            none: {},
          },
          deviceAddress: _deviceAddress,
        },
      });

      if (recordWithoutEvents) {
        return { isAuditPending: true };
      }

      // Record with success call
      const recordWithSuccessfulCall =
        await this._prismaService.record.findFirst({
          where: {
            permitDeadline: {
              gt: getUnixTimeInSeconds(),
            },
            events: {
              some: {
                eventType: {
                  equals: 'SubcallSucceeded',
                },
              },
            },
            deviceAddress: _deviceAddress,
          },
          select: {
            id: true,
            deviceAddress: true,
            timestamp: true,
            events: true,
          },
          orderBy: {
            timestamp: 'desc',
          },
        });
      // No record with successful audit, then no audit is pending
      if (!recordWithSuccessfulCall) {
        return { isAuditPending: false };
      }
      const event = recordWithSuccessfulCall.events.pop();
      const blockTimeStamp = await this._blockchainService.getBlockTimestamp(
        event.blockNumber,
      );
      const isAuditDone =
        Math.round(Date.now() / 1000) >= AUDIT_SAFETY_OFFSET + blockTimeStamp;
      return { isAuditPending: !isAuditDone };
    } catch (error) {
      this.logger.error(`Error checking audit status: ${error.message}`, {
        stack: error.stack,
        device: _deviceAddress,
      });
      throw new Error(ErrorCodes.DATABASE_ERROR.code);
    }
  }
}
