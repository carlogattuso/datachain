import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { RecordsModule } from './records/records.module';
import { CronModule } from './cron/cron.module';
import { AppService } from './app.service';

@Module({
  controllers: [AppController],
  imports: [
    BlockchainModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      envFilePath: process.env.NODE_ENV ? '.env.dev' : '.env',
      isGlobal: true,
    }),
    AuthModule,
    RecordsModule,
    CronModule,
  ],
  providers: [AppService],
})
export class AppModule {}
