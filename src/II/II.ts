import {idlFactory} from "./did/II"
import {Ed25519KeyIdentity} from "@dfinity/identity";
import {Actor, HttpAgent} from "@dfinity/agent";
import {Principal} from "@dfinity/principal";
import {GetDelegationResponse} from "./did/II_type";
import {sha256} from "js-sha256";

export function fromHexString(hexString: string): ArrayBuffer {
  return new Uint8Array((hexString.match(/.{1,2}/g) ?? []).map(byte => parseInt(byte, 16))).buffer;
}

export interface Delegation {
  delegation: {
    pubkey: Uint8Array;
    expiration: bigint;
    targets?: Principal[];
  };
  signature: Uint8Array;
}

type PublicKey = Array<number>;

interface InternetIdentityAuthResponseSuccess {
  delegations: {
    delegation: {
      pubkey: Uint8Array;
      expiration: bigint;
      targets?: Principal[];
    };
    signature: Uint8Array;
  }[];
  userPublicKey: Uint8Array;
}

const ii_cid =
  // "rwlgt-iiaaa-aaaaa-aaaaa-cai"
  "h3id2-uqaaa-aaaao-ajjoa-cai"

export class II {
  private readonly identity: Ed25519KeyIdentity

  constructor(identity: Ed25519KeyIdentity) {
    this.identity = identity
  }

  async getActor() {
    const agent = new HttpAgent({
      identity: this.identity,
      host: "https://ic0.app"
    })
    return Actor.createActor(idlFactory, {
      agent,
      canisterId: ii_cid,
    });
  }

  get_pubKey_json() {
    return this.identity.toJSON()
  }

  get_pubKey() {
    return this.identity.getPublicKey()
  }

  async prepare_delegation(address: string, json_pub_key: string, sig: string, maxTimeToLive: bigint) {
    const Actor = await this.getActor()
    const arg = [address.slice(2), json_pub_key, sig]
    const res = await Actor.prepare_delegation([maxTimeToLive], arg) as [Uint8Array, bigint]
    return await this.get_delegation(address, res)
  }

  async get_delegation(address: string, arg: [Uint8Array, bigint]) {
    const Actor = await this.getActor();
    const array = fromHexString(address.slice(2))
    const seed = sha256.digest(array)
    const callBack = async (): Promise<GetDelegationResponse> => {
      return await Actor.get_delegation(seed, [...new Uint8Array(this.get_pubKey().toDer())], arg[1]) as GetDelegationResponse
    }
    const signed_delegation = await retryGetDelegation(callBack)
    const c: [PublicKey, Delegation] = [
      [...arg[0]],
      {
        delegation: {
          pubkey: Uint8Array.from(signed_delegation.delegation.pubkey),
          expiration: BigInt(signed_delegation.delegation.expiration),
          targets: undefined,
        },
        signature: Uint8Array.from(signed_delegation.signature),
      },
    ]
    const [userKey, parsed_signed_delegation] = c
    const d: InternetIdentityAuthResponseSuccess = {
      delegations: [parsed_signed_delegation],
      userPublicKey: Uint8Array.from(userKey)
    }
    return d
  }
}

const retryGetDelegation = async (callback: () => Promise<GetDelegationResponse>, maxRetries = 5,) => {
  for (let i = 0; i < maxRetries; i++) {
    // Linear backoff
    await new Promise((resolve) => {
      setInterval(resolve, 1000 * i);
    });
    const res = await callback()
    if ("signed_delegation" in res) {
      return res.signed_delegation;
    }
  }
  throw new Error(
    `Failed to retrieve a delegation after ${maxRetries} retries.`
  );
}



