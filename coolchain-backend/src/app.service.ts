import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MoonbeamService } from './moonBeam/moonbeam.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Event, Record } from '@prisma/client';
import { CreateEventDTO } from './types/dto/CreateEventDTO';
import { CreateRecordDTO } from './types/dto/CreateRecordDTO';
import { RecordDTO } from './types/dto/RecordDTO';
import { Device } from './types/Device';
import { Auditor } from './types/Auditor';

@Injectable()
export class AppService {
  private readonly logger: Logger = new Logger(AppService.name);

  constructor(
    private _prismaService: PrismaService,
    private _moonbeamService: MoonbeamService,
  ) {}

  getHello(): string {
    return 'Welcome to Coolchain!';
  }

  async storeUnauditedRecord(_record: CreateRecordDTO): Promise<Record> {
    try {
      return await this._prismaService.storeUnauditedRecord(_record);
    } catch (error) {
      throw new BadRequestException(error.toString());
    }
  }

  async getRecords(_deviceAddress: string): Promise<RecordDTO[]> {
    return await this._prismaService.getRecordsWithEvents(_deviceAddress);
  }

  async getRecordsByDevice(
    _deviceAddress: string | null,
  ): Promise<RecordDTO[]> {
    return await this._prismaService.getRecordsWithEvents(_deviceAddress);
  }

  async getDevices(): Promise<Device[]> {
    return await this._prismaService.getDevices();
  }
  async getAuditors(): Promise<Auditor[]> {
    return await this._prismaService.getAuditors();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async blockchainChronicler() {
    this.logger.verbose('Blockchain Chronicler: Start');

    const unauditedRecords: Record[] =
      await this._prismaService.getUnauditedRecords(3);

    if (unauditedRecords.length > 0) {
      this.logger.verbose(
        `Blockchain Chronicler: Records ${unauditedRecords.map((record: Record) => record.id)} under audit`,
      );

      const auditResult: CreateEventDTO[] =
        await this._moonbeamService.auditRecords(unauditedRecords);

      auditResult.forEach((event: Event) => {
        this.logger.verbose(
          `Blockchain Chronicler: Record ${event.recordId} - ${event.eventType} - Tx Hash ${event.transactionHash}`,
        );
      });

      await this._prismaService.auditRecords(auditResult);
    }

    this.logger.verbose(
      `Blockchain Chronicler: End - ${unauditedRecords.length} records audited`,
    );
  }
}
