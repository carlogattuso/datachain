import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  AddressLike,
  Contract,
  ContractTransactionReceipt,
  ContractTransactionResponse,
  EventLog,
  Interface,
  JsonRpcProvider,
  Signature,
  Wallet,
} from 'ethers';
import {
  BATCH_PRECOMPILE_ABI,
  BATCH_PRECOMPILE_ADDRESS,
  PERMIT_PRECOMPILE_ABI,
  PERMIT_PRECOMPILE_ADDRESS,
  PERMIT_PRECOMPILE_GAS_LIMIT,
} from '../utils/constants';
import { CreateEventDTO } from '../events/types/dto/CreateEventDTO';
import { Record } from '../records/types/Record';
import { EventType } from '@prisma/client';
import {
  createJsonRpcProvider,
  getCoolchainContract,
} from './blockchain.utils';
import { RegisterAuditorDTO } from '../auditors/types/dto/RegisterAuditorDTO';

@Injectable()
export class BlockchainService {
  private readonly provider: JsonRpcProvider;
  private accountFrom: { privateKey: string };
  private readonly contractAddress: string;
  private readonly chainId: number;
  private readonly chainName: string;
  private readonly chainRpcUrl: string;
  private readonly wallet: Wallet;

  constructor(private readonly _configService: ConfigService) {
    this.accountFrom = {
      privateKey: this._configService.get('WALLET_PRIVATE_KEY'),
    };
    this.contractAddress = this._configService.get<string>('CONTRACT_ADDRESS');
    this.chainName = this._configService.get<string>('CHAIN_NAME');
    this.chainRpcUrl = this._configService.get<string>('CHAIN_RPC_URL');
    this.chainId = +this._configService.get<number>('CHAIN_ID');

    this.provider = createJsonRpcProvider(
      this.chainRpcUrl,
      this.chainId,
      this.chainName,
    );

    this.wallet = new Wallet(this.accountFrom.privateKey, this.provider);
  }

  async auditRecords(_unsignedRecords: Record[]): Promise<CreateEventDTO[]> {
    const batchPrecompiled = new Contract(
      BATCH_PRECOMPILE_ADDRESS,
      BATCH_PRECOMPILE_ABI,
      this.wallet,
    );

    const addresses = Array(_unsignedRecords.length).fill(
      PERMIT_PRECOMPILE_ADDRESS,
    );
    const values = Array(_unsignedRecords.length).fill(0);
    const gasLimit = [];

    const callData = await this.mapRecordsToPermitCallData(_unsignedRecords);

    const transaction: ContractTransactionResponse =
      await batchPrecompiled.batchSome(addresses, values, callData, gasLimit);

    const receipt: ContractTransactionReceipt = await transaction.wait();

    const recordMap = new Map<number, string>(
      _unsignedRecords.map((record, index) => [index, record.id]),
    );

    return receipt.logs.map((log: EventLog) => {
      const recordId = recordMap.get(log.index);
      return {
        transactionHash: log.transactionHash,
        blockHash: log.blockHash,
        blockNumber: log.blockNumber,
        address: log.address,
        data: log.data,
        topics: [...log.topics],
        index: log.index,
        transactionIndex: log.transactionIndex,
        eventType: log.fragment.name as EventType,
        recordId: recordId,
      };
    });
  }

  async registerAuditor(
    _auditor: RegisterAuditorDTO,
  ): Promise<ContractTransactionReceipt> {
    const coolchainContract = new Contract(
      this.contractAddress,
      getCoolchainContract().abi,
      this.wallet,
    );

    const address = _auditor.address;

    const transaction: ContractTransactionResponse =
      await coolchainContract.registerAuditor(address);
    return await transaction.wait();
  }

  async registerDevice(
    _auditorAddress: AddressLike,
    _deviceAddress: AddressLike
  ): Promise<ContractTransactionReceipt> {
    const coolchainContract = new Contract(
      this.contractAddress,
      getCoolchainContract().abi,
      this.wallet,
    );

    const transaction: ContractTransactionResponse =
      await coolchainContract.registerDevice(_auditorAddress, _deviceAddress);
    return await transaction.wait();
  }

  private async mapRecordsToPermitCallData(
    _records: Record[],
  ): Promise<Awaited<string>[]> {
    return Promise.all(
      _records.map((record: Record) => this.createPermitCallData(record)),
    );
  }

  private async createPermitCallData(_record: Record) {
    const from: AddressLike = _record.deviceAddress as AddressLike;
    const to: AddressLike = this.contractAddress as AddressLike;
    const value = 0;
    const gasLimit = PERMIT_PRECOMPILE_GAS_LIMIT;

    const { v, r, s } = Signature.from(_record.permitSignature);

    const coolchainContractInterface: Interface = new Interface(
      getCoolchainContract().abi,
    );

    const permitPrecompileInteface: Interface = new Interface(
      PERMIT_PRECOMPILE_ABI,
    );

    const recordCallData = coolchainContractInterface.encodeFunctionData(
      'storeRecord',
      [_record.deviceAddress, _record.value, _record.timestamp],
    );

    return permitPrecompileInteface.encodeFunctionData('dispatch', [
      from,
      to,
      value,
      recordCallData,
      gasLimit,
      _record.permitDeadline,
      v,
      r,
      s,
    ]);
  }
}
