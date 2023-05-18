import type {Principal} from '@dfinity/principal';
import type {ActorMethod} from '@dfinity/agent';

export interface Delegation {
  'pubkey': Array<number>,
  'targets': [] | [Array<Principal>],
  'expiration': bigint,
}

export type GetDelegationResponse = { 'no_such_delegation': null } |
  { 'signed_delegation': SignedDelegation };

export interface SignedDelegation {
  'signature': Array<number>,
  'delegation': Delegation,
}

export interface _SERVICE {
  'get_delegation': ActorMethod<[Array<number>, Array<number>, bigint],
    GetDelegationResponse>,
  'prepare_delegation': ActorMethod<[[] | [bigint], [string, string, string]],
    [Array<number>, bigint]>,
}
