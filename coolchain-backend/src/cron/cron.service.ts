import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BlockchainService } from '../blockchain/blockchain.service';
import { RecordsService } from '../records/records.service';
import { EVERY_30_SECONDS, MAX_RECORD_BATCH_SIZE } from '../utils/constants';
import { Record } from '../records/types/Record';
import { Event } from '../events/types/Event';
import { EventsService } from '../events/events.service';

@Injectable()
export class CronService {
  private readonly logger: Logger = new Logger(CronService.name);

  constructor(
    private readonly _recordsService: RecordsService,
    private readonly _eventsService: EventsService,
    private readonly _blockchainService: BlockchainService,
  ) {}

  @Cron(EVERY_30_SECONDS)
  async blockchainChronicler() {
    this.logger.verbose('Blockchain Chronicler: Start');

    const unauditedRecords: Record[] =
      await this._recordsService.getUnauditedRecords(MAX_RECORD_BATCH_SIZE);

    if (unauditedRecords.length > 0) {
      this.logger.verbose(
        `Blockchain Chronicler: Records ${unauditedRecords.map((record: Record) => record.id)} under audit`,
      );

      const auditResult =
        await this._blockchainService.auditRecords(unauditedRecords);

      if (auditResult) {
        auditResult.forEach((event: Event) => {
          this.logger.verbose(
            `Blockchain Chronicler: Record ${event.recordId} - ${event.eventType} - Tx Hash ${event.transactionHash}`,
          );
        });

        await this._eventsService.storeEvents(auditResult);
        this.logger.verbose(
          `Blockchain Chronicler: End - ${auditResult.length} records audited`,
        );
      } else {
        this.logger.verbose(`Blockchain Chronicler: End - 0 records audited`);
      }
    } else {
      this.logger.verbose(`Blockchain Chronicler: End - 0 records audited`);
    }
  }
}
