import {
  parseTradeSectionInstance,
  parseTradeSectionInstances,
  parseTradeSectionWorkTypes,
  type TradeSectionInstance,
} from './tradeSectionContracts';

type RpcResult = { data: unknown; error: unknown };

export interface TradeSectionRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type TradeSectionAdapterErrorKind = 'unauthorized' | 'stale' | 'ambiguous' | 'rpc' | 'malformed';

export class TradeSectionAdapterError extends Error {
  constructor(public readonly kind: TradeSectionAdapterErrorKind, message: string) {
    super(message);
    this.name = 'TradeSectionAdapterError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function serverError(error: unknown, mutation: boolean) {
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : '';
  if (isRecord(error) && (error.code === '42501' || error.status === 401 || error.status === 403)) {
    return new TradeSectionAdapterError('unauthorized', 'Trade Sections are unavailable for this account or Job.');
  }
  if (message.includes('Trade Section capability is unavailable.')) {
    return new TradeSectionAdapterError('unauthorized', 'Trade Section access changed. Reload before making another change.');
  }
  if (message.includes('Trade Section has changed; refresh and try again.')) {
    return new TradeSectionAdapterError('stale', 'This Trade Section changed. Reload the latest version before saving again.');
  }
  return new TradeSectionAdapterError('rpc', mutation
    ? 'ServSync could not save this Trade Section.'
    : 'ServSync could not load Trade Sections.');
}

function malformedError() {
  return new TradeSectionAdapterError('malformed', 'ServSync received an invalid Trade Section response.');
}

async function readRpc(
  client: TradeSectionRpcClient,
  name: string,
  args: Record<string, unknown>,
) {
  try {
    const result = await client.rpc(name, args);
    if (result.error) throw serverError(result.error, false);
    return result.data;
  } catch (error) {
    if (error instanceof TradeSectionAdapterError) throw error;
    throw new TradeSectionAdapterError('rpc', 'ServSync could not load Trade Sections.');
  }
}

async function mutationRpc(
  client: TradeSectionRpcClient,
  name: string,
  args: Record<string, unknown>,
) {
  let result: RpcResult;
  try {
    result = await client.rpc(name, args);
  } catch {
    throw new TradeSectionAdapterError(
      'ambiguous',
      'The save result could not be confirmed. Reload before trying again.',
    );
  }
  if (result.error) throw serverError(result.error, true);
  return result.data;
}

export function createTradeSectionAdapter(client: TradeSectionRpcClient) {
  return {
    async listAvailableWorkTypes(contractorId: string) {
      const data = await readRpc(client, 'servsync_list_available_trade_pack_work_types', {
        p_contractor_id: contractorId,
      });
      try {
        return parseTradeSectionWorkTypes(data);
      } catch {
        throw malformedError();
      }
    },

    async listJobInstances(contractorId: string, jobId: string) {
      const data = await readRpc(client, 'servsync_list_trade_section_instances', {
        p_work_draft_id: null,
        p_job_id: jobId,
      });
      try {
        return parseTradeSectionInstances(data, { contractorId, jobId });
      } catch {
        throw malformedError();
      }
    },

    async createJobInstance(input: {
      contractorId: string;
      jobId: string;
      workTypeKey: string;
      versionNumber: number;
      values: Record<string, unknown>;
      sectionOrder: number;
      idempotencyKey: string;
    }): Promise<TradeSectionInstance> {
      const data = await mutationRpc(client, 'servsync_create_trade_section_instance', {
        p_work_draft_id: null,
        p_job_id: input.jobId,
        p_work_type_key: input.workTypeKey,
        p_version_number: input.versionNumber,
        p_property_asset_id: null,
        p_values: input.values,
        p_section_order: input.sectionOrder,
        p_idempotency_key: input.idempotencyKey,
      });
      try {
        return parseTradeSectionInstance(data, { contractorId: input.contractorId, jobId: input.jobId });
      } catch {
        throw malformedError();
      }
    },

    async updateValues(input: {
      contractorId: string;
      jobId: string;
      instanceId: string;
      expectedRevision: number;
      values: Record<string, unknown>;
    }): Promise<TradeSectionInstance> {
      const data = await mutationRpc(client, 'servsync_update_trade_section_values', {
        p_instance_id: input.instanceId,
        p_expected_revision: input.expectedRevision,
        p_values: input.values,
      });
      try {
        const instance = parseTradeSectionInstance(data, {
          contractorId: input.contractorId,
          jobId: input.jobId,
          instanceId: input.instanceId,
        });
        if (instance.revisionNumber !== input.expectedRevision + 1) throw malformedError();
        return instance;
      } catch (error) {
        if (error instanceof TradeSectionAdapterError) throw error;
        throw malformedError();
      }
    },
  };
}
