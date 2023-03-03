import {idlFactory} from "./did/metabox"
import {Actor, ActorMethod, ActorSubclass, HttpAgent} from "@dfinity/agent";
import {Principal} from "@dfinity/principal";
import {
  BoxAllInfo,
  BoxInfo__1,
  BoxMetadata,
  CreateBoxArgs,
  DelBoxArgs,
  Result,
  Result_5,
  Result_6,
  TopUpArgs,
  UpgradeBoxArgs
} from "./did/metabox_type";
import {getEHTICPSymbol, getToAccountIdentifier, getTokenPrice} from "../utils";
import {DataBox} from "../databox";

export const mb_cid = "zbzr7-xyaaa-aaaan-qadeq-cai"

export type Token = "eth" | "usdt" | "icp"

export type Wallet = "metamask"

export type Props = {
  token: Exclude<Token, 'icp'>,
  wallet: Wallet
}

export class MetaBox {
  private readonly metaBoxCai = mb_cid
  private readonly agent: HttpAgent
  private readonly MetaBoxActor: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>>

  constructor(agent: HttpAgent) {
    this.agent = agent
    this.MetaBoxActor = Actor.createActor(idlFactory, {agent, canisterId: this.metaBoxCai})
  }

  private _createBoxByICP(arg: BoxMetadata) {
    return new Promise<Principal>(async (resolve, reject) => {
      try {
        const Actor = this.MetaBoxActor;
        const Arg: CreateBoxArgs = {
          'metadata': arg
        }
        const res = await Actor.createDataBoxFee(Arg, true) as Result_6
        if ("ok" in res) return resolve(res.ok)
        else reject(`${Object.keys(res.err)[0]}`);
      } catch (e) {
        reject(e);
      }
    });
  }

  private _createBoxWithController(arg: BoxMetadata, controller?: Principal) {
    return new Promise<Principal>(async (resolve, reject) => {
      try {
        const Actor = this.MetaBoxActor;
        const arg_0: CreateBoxArgs = {
          metadata: arg
        }
        const res = await Actor.createDataBoxControl(arg_0, true, controller ? [controller] : []) as Result_6
        if ("ok" in res) return resolve(res.ok)
        else reject(`${Object.keys(res.err)[0]}`);
      } catch (e) {
        throw e
      }
    })
  }

  private async _emitShareBox(box_id: Principal, to: Principal): Promise<Result> {
    try {
      const Actor = this.MetaBoxActor;
      return await Actor.emitShareBox(box_id, to) as Result
    } catch (e) {
      throw  e
    }
  }

  private async _topUpBoxByICP(TopUpArgs: TopUpArgs): Promise<Result> {
    try {
      return await this.MetaBoxActor.topUpBox(TopUpArgs) as Result
    } catch (e) {
      throw e
    }
  }

  private async _cancelShareBox(box_id: Principal, to: Principal): Promise<Result> {
    try {
      const Actor = this.MetaBoxActor;
      return await Actor.removeShareBox(box_id, to) as Result
    } catch (e) {
      throw  e
    }
  }

  async isFirstCreateBox(): Promise<boolean> {
    try {
      const Actor = this.MetaBoxActor;
      return !(await Actor.isNotFirstDataBox())
    } catch (e) {
      throw e
    }
  }

  async getICAccountID() {
    const principal = await this.agent.getPrincipal()
    return getToAccountIdentifier(Principal.from(this.metaBoxCai), principal)
  }

  async createBoxForFree(
    arg: BoxMetadata
  ) {
    return new Promise<Principal>(async (resolve, reject) => {
      try {
        const Actor = this.MetaBoxActor;
        const Arg: CreateBoxArgs = {
          'metadata': arg
        }
        const res = await Actor.createDataBoxFree(Arg) as Result_6
        if ("ok" in res) return resolve(res.ok)
        else reject(`${Object.keys(res.err)[0]}`);
      } catch (e) {
        reject(e);
      }
    });
  }


  async createBox(arg: BoxMetadata, props?: Props) {
    return new Promise<Principal>(async (resolve, reject) => {
      try {
        if (props) return reject("coming soon")
        const res = await this._createBoxByICP(arg)
        return resolve(res)
      } catch (e) {
        reject(e);
      }
    });
  }

  async getRequiredToken(token: Token): Promise<number> {
    try {
      const Actor = this.MetaBoxActor;
      const res = Number(await Actor.getIcp())
      if (token === "icp") return res
      if (token === "eth") return await getEHTICPSymbol(res)
      const icpPrice = await getTokenPrice("ICP")
      return icpPrice * res
    } catch (e) {
      throw e
    }
  }

  public async getAllBoxes(principal: Principal): Promise<BoxAllInfo[]> {
    try {
      return await this.MetaBoxActor.getBoxes(principal) as BoxAllInfo[]
    } catch (e) {
      throw e
    }
  }

  public async deleteBox(delBoxArgs: DelBoxArgs): Promise<Result_5> {
    try {
      return await this.MetaBoxActor.deleteBox(delBoxArgs) as Result_5
    } catch (e) {
      throw e
    }
  }

  async transferBoxOwner(canister_id: Principal, to: Principal): Promise<Result> {
    try {
      return await this.MetaBoxActor.transferDataboxOwner(canister_id, to) as Result
    } catch (e) {
      throw  e
    }
  }

  public async startBox(boxInfo: BoxInfo__1) {
    try {
      await this.MetaBoxActor.startBox(boxInfo)
    } catch (e) {
      throw e
    }
  }


  async topUpBox(box_id: Principal, amount: number, props?: Props): Promise<Result> {
    if (props) throw new Error("coming soon")
    try {
      const arg: TopUpArgs = {
        box_id,
        icp_amount: BigInt(amount)
      }
      return await this._topUpBoxByICP(arg)
    } catch (e) {
      throw e
    }
  }

  async upgradeBox(UpgradeBoxArgs: UpgradeBoxArgs): Promise<Result> {
    try {
      return await this.MetaBoxActor.upgradeBox(UpgradeBoxArgs) as Result
    } catch (e) {
      throw e
    }
  }

  async getBoxLatestVersion(): Promise<bigint> {
    try {
      return await this.MetaBoxActor.getDataBoxVersion() as bigint
    } catch (e) {
      throw e
    }
  }

  async updateBoxInfo(BoxInfo__1: BoxInfo__1): Promise<Result> {
    try {
      return await this.MetaBoxActor.updateBoxInfo(BoxInfo__1) as Result
    } catch (e) {
      throw e
    }
  }


  createBoxWithController(arg: BoxMetadata, controller?: Principal, props?: Props) {
    return new Promise<Principal>(async (resolve, reject) => {
      try {
        if (props) return reject("coming soon")
        const res = await this._createBoxWithController(arg, controller)
        return resolve(res)
      } catch (e) {
        throw e
      }
    })
  }

  async cancelShareBox(box_id: Principal, to: Principal) {
    try {
      const databoxApi = new DataBox(box_id.toString(), this.agent)
      const res = await Promise.all([this._cancelShareBox(box_id, to), databoxApi.deleteCon(to)])
      const [res_1, res_2] = res
      if ("ok" in res_1 && "ok" in res_2) return true
      Promise.all([this._cancelShareBox(box_id, to), databoxApi.deleteCon(to)]).then()
      if ("err" in res_1) throw new Error(Object.keys(res_1.err)[0])
      if ("err" in res_2) throw new Error(Object.keys(res_2.err)[0])
      return false
    } catch (e) {
      throw e
    }
  }


  async shareBox(box_id: Principal, to: Principal) {
    try {
      const databoxApi = new DataBox(box_id.toString(), this.agent)
      const res = await Promise.all([this._emitShareBox(box_id, to), databoxApi.addCon(to)])
      const [res_1, res_2] = res
      if ("ok" in res_1 && "ok" in res_2) return true
      Promise.all([this._cancelShareBox(box_id, to), databoxApi.deleteCon(to)]).then()
      if ("err" in res_1) throw new Error(Object.keys(res_1.err)[0])
      if ("err" in res_2) throw new Error(Object.keys(res_2.err)[0])
      return false
    } catch (e) {
      throw e
    }
  }

  async transferBox(box_id: Principal, to: Principal) {
    try {
      const databoxApi = new DataBox(box_id.toString(), this.agent)
      const res = await Promise.all([this.transferBoxOwner(box_id, to), databoxApi.transferOwner(to)])
      const [res_1, res_2] = res
      if ("ok" in res_1 && "ok" in res_2) return true
      if ("err" in res_1) throw new Error(Object.keys(res_1.err)[0])
      if ("err" in res_2) throw new Error(Object.keys(res_2.err)[0])
      return false
    } catch (e) {
      throw e
    }
  }

}
