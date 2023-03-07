import {idlFactory} from "./did/metabox"
import {Actor, ActorMethod, ActorSubclass, HttpAgent, SubmitResponse} from "@dfinity/agent";
import {Principal as BoxID} from "@dfinity/principal";
import {
  BoxAllInfo, BoxInfo,
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
import {ICSP} from "js-isp"
import {
  batchRequest,
  chunkSize, ErrorHandler,
  getEHTICPSymbol, getSubArray,
  getToAccountIdentifier,
  getTokenPrice,
  retry, sleep,
  splitArray
} from "../utils";
import {Box, Identity} from "../databox";
import {FileExt, FilePut, Result_2} from "../databox/did/databox_type";

export const mb_cid = "zbzr7-xyaaa-aaaan-qadeq-cai"

export type Token = "eth" | "usdt" | "icp"

export type Wallet = "metamask"

export type Props = {
  token: Exclude<Token, 'icp'>,
  wallet: Wallet
}
type valueType = Blob | string

type struct = {
  key: string,
  value: valueType
}

export class MetaBox {
  private readonly metaBoxCai = mb_cid
  private readonly agent: HttpAgent
  private readonly MetaBoxActor: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>>

  constructor(agent: HttpAgent) {
    this.agent = agent
    this.MetaBoxActor = Actor.createActor(idlFactory, {agent, canisterId: this.metaBoxCai})
  }

  private async _isFirstCreateBox(): Promise<boolean> {
    try {
      const Actor = this.MetaBoxActor;
      const res = await Actor.isNotFirstDataBox()
      return !res
    } catch (e) {
      throw e
    }
  }

  private _createBoxForFree(
    arg: BoxMetadata
  ) {
    return new Promise<BoxID>(async (resolve, reject) => {
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

  private _createBoxByICP(arg: BoxMetadata) {
    return new Promise<BoxID>(async (resolve, reject) => {
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

  private _createBoxWithController(arg: BoxMetadata, controller?: Identity) {
    return new Promise<BoxID>(async (resolve, reject) => {
      try {
        if (controller && !("ICP" in controller)) return reject("coming soon")
        const Actor = this.MetaBoxActor;
        const arg_0: CreateBoxArgs = {
          metadata: arg
        }
        const res = await Actor.createDataBoxControl(arg_0, true, controller ? [controller.ICP] : []) as Result_6
        if ("ok" in res) return resolve(res.ok)
        else reject(`${Object.keys(res.err)[0]}`);
      } catch (e) {
        throw e
      }
    })
  }

  private async _emitShareBox(box_id: BoxID, to: Identity): Promise<Result> {
    try {
      if (!("ICP" in to)) throw new Error("coming soon")
      const Actor = this.MetaBoxActor;
      return await Actor.emitShareBox(box_id, to.ICP) as Result
    } catch (e) {
      throw  e
    }
  }

  private async _transferBoxOwner(canister_id: BoxID, to: Identity): Promise<Result> {
    try {
      if (!("ICP" in to)) throw new Error("coming soon")
      return await this.MetaBoxActor.transferDataboxOwner(canister_id, to.ICP) as Result
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

  private async _cancelShareBox(box_id: BoxID, who: Identity): Promise<Result> {
    try {
      if (!("ICP" in who)) throw new Error("coming soon")
      const Actor = this.MetaBoxActor;
      return await Actor.removeShareBox(box_id, who.ICP) as Result
    } catch (e) {
      throw  e
    }
  }

  pullICSPData(fileKeyArray: string[], icspCanisterId: string) {
    return new Promise<struct[]>(async (resolve, reject) => {
      try {
        if (fileKeyArray.length === 0) return reject("array is empty")
        const result: struct[] = []
        const icspApi = new ICSP(icspCanisterId, this.agent)
        const chunkKeyArray: string[][] = splitArray(fileKeyArray, 30)
        const one_request = (fileKey: string, index: number) => {
          return (): Promise<{ data: valueType, index: number }> => {
            return new Promise<{ data: valueType, index: number }>(async (resolve, reject) => {
              try {
                const res = await icspApi.get_file(fileKey)
                return resolve({data: res, index})
              } catch (e) {
                reject(e)
              }
            })
          }
        }

        for (let i = 0; i < chunkKeyArray.length; i++) {
          const allPromises: (() => Promise<{ data: valueType, index: number }>)[] = []
          const oneTimeQuery: string[] = chunkKeyArray[i]
          oneTimeQuery.forEach((value, index) => allPromises.push(one_request(value, index)))
          const res: { data: valueType, index: number }[] = await retry<valueType>(allPromises, 4)
          res.forEach(e => result.push({key: oneTimeQuery[e.index], value: e.data}))
          console.log(res, i)
          await sleep(1000)
        }
        return resolve(result)
      } catch (e) {
        reject(e)
      }
    })
  }

  migrate(icspCanisterId: string, boxId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const icspApi = new ICSP(icspCanisterId, this.agent)
        const allICSPKeys: string[] = await icspApi.getAllIcFileKey()
        const boxApi = new Box(boxId, this.agent)
        const allBoxFileInfo: FileExt[] = await boxApi.batchGetAllFileInfo({Plain: null}, 100)
        const allBoxFileKey: string[] = []
        if (allBoxFileInfo.length > 0) allBoxFileInfo.forEach(e => "PlainFileExt" in e && allBoxFileKey.push(e.PlainFileExt.file_key))
        const allIcKeys: string[] = getSubArray(allICSPKeys, allBoxFileKey)
        if (allIcKeys.length === 0) return reject("have no data to migrate")
        const allICSPData: struct[] = await this.pullICSPData(allIcKeys, icspCanisterId)
        const res = await this.putICSPDataToBox(allICSPData, boxId)
        return resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  putICSPDataToBox(allICSPData: struct[], boxId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (allICSPData.length === 0) return reject("have no ICSP data")
        const filePutArray: FilePut[] = []
        for (let i = 0; i < allICSPData.length; i++) {
          const e = allICSPData[i]
          const fileExtension = typeof e.value === "string" ? "text/plain" : e.value.type
          let data: Uint8Array
          if (typeof e.value === "string") data = new TextEncoder().encode(e.value)
          else {
            const ab = await e.value.arrayBuffer()
            data = new Uint8Array(ab)
          }
          filePutArray.push({
            'PlainFilePut': {
              'IC': {
                'file_extension': fileExtension,
                'order': BigInt(0),
                'chunk_number': BigInt(1),
                'chunk': {data: data},
                'aes_pub_key': [],
                'is_private': true,
                'file_name': "",
                'file_key': e.key,
                'total_size': BigInt(data.byteLength),
              }
            }
          })
        }
        const a = await this._putFile(filePutArray, boxId)
        resolve(a)
      } catch (e) {
        reject(e)
      }
    })
  }


  _putFile(filePutArray: FilePut[], boxId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (filePutArray.length === 0) return reject("array is empty")
        const newArray: FilePut[][] = batchRequest(filePutArray, chunkSize)
        console.log(newArray)
        const batchArray = splitArray<FilePut[]>(newArray, 30)
        console.log(batchArray)
        const boxApi = new Box(boxId, this.agent)
        for (let i = 0; i < batchArray.length; i++) {
          const promiseArray: (() => Promise<{ data: Array<Result_2>, index: number }>)[] = []
          const item: FilePut[][] = batchArray[i]
          item.forEach((e, k) => promiseArray.push(boxApi.batchPut(e, k)))
          const res: { data: Result_2[], index: number }[] = await retry<Result_2[]>(promiseArray, 4)
          console.log("result", res, i)
          if (res.every(e => e.data.every(k => "ok" in k))) {

          } else {
            return reject(res[0])
          }
        }
        return resolve(1)
      } catch (e) {
        reject(e)
      }
    })
  }


  /**
   * 获取用户在MetaBox里面的account ID
   *
   * @return {string} account ID
   */
  async getICAccountID() {
    const principal = await this.agent.getPrincipal()
    return getToAccountIdentifier(BoxID.from(this.metaBoxCai), principal)
  }

  /**
   * 创建 Box
   *
   * @param {Omit<BoxMetadata, "box_type">} arg Box 信息
   * @param {Props} props option 选择支付的代币
   * @return {BoxID} Box ID
   */
  async createBox(arg: Omit<BoxMetadata, "box_type">, props?: Props): Promise<BoxID> {
    return new Promise<BoxID>(async (resolve, reject) => {
      try {
        if (props) return reject("coming soon")
        const isFirstCreateBox = await this._isFirstCreateBox()
        const arg_1: BoxMetadata = {
          ...arg, box_type: {'data_box': null}
        }
        const res = isFirstCreateBox ? await this._createBoxForFree(arg_1) : await this._createBoxByICP(arg_1)
        return resolve(res)
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 获取创建一个Box所需的费用
   *
   * @param {Token} token
   *
   * @return {number} 价格
   */
  async getRequiredToken(token: Token): Promise<number> {
    try {
      const Actor = this.MetaBoxActor;
      const res = Number(await Actor.getIcp())
      const needICP = ((res / 1e8) + 0.01).toFixed(2)
      const numberNeedIcp = Number(needICP)
      if (token === "icp") return numberNeedIcp
      if (token === "eth") return await getEHTICPSymbol(numberNeedIcp)
      const icpPrice = await getTokenPrice("ICP")
      return icpPrice * numberNeedIcp
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取指定用户所有 Box列表
   * @param { Identity } who 支持几种身份体系 目前实现ICP
   * @return {BoxAllInfo[]} Box 信息列表
   */
  public async getAllBoxes(who: Identity): Promise<BoxAllInfo[]> {
    try {
      if (!("ICP" in who)) throw new Error("coming soon")
      return await this.MetaBoxActor.getBoxes(who.ICP) as BoxAllInfo[]
    } catch (e) {
      throw e
    }
  }

  /**
   * 删除 Box
   * @param {Omit<DelBoxArgs, "box_type">} delBoxArgs Box 信息
   * @return {string}
   *
   * @example
   *  deleteBox({
   *   'cycleTo': [] , //删除之后Box的cycle回收,只能填自己另外的Box ID,不填默认转给MetaBox
   *   'canisterId': Principal.from(canisterID),
   * })
   */
  public async deleteBox(delBoxArgs: Omit<DelBoxArgs, "box_type">): Promise<string> {
    try {
      const arg: DelBoxArgs = {
        ...delBoxArgs, box_type: {data_box: null}
      }
      const res = await this.MetaBoxActor.deleteBox(arg) as Result_5
      return ErrorHandler(res)
    } catch (e) {
      throw e
    }
  }


  /**
   * 启动Box
   * @param {BoxInfo__1} boxInfo Box Info
   */
  public async startBox(boxInfo: BoxInfo__1) {
    try {
      await this.MetaBoxActor.startBox(boxInfo)
    } catch (e) {
      throw e
    }
  }


  /**
   * 给Box 充值
   *
   * @param {BoxID} box_id Box ID
   * @param {number} amount 数额
   * @param {Props} props option 代币
   */
  async topUpBox(box_id: BoxID, amount: number, props?: Props): Promise<Result> {
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

  /**
   * 升级 Box
   * @param {Omit<BoxInfo, "status" | "box_type">} UpgradeBoxArgs Box Info
   */
  async upgradeBox(UpgradeBoxArgs: Omit<BoxInfo, "status" | "box_type">): Promise<Result> {
    try {
      const arg: UpgradeBoxArgs = {
        info: {
          ...UpgradeBoxArgs, status: {'running': null}, box_type: {data_box: null}
        }
      }
      return await this.MetaBoxActor.upgradeBox(arg) as Result
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取Box最新的版本
   * @return {number}
   */
  async getBoxLatestVersion(): Promise<bigint> {
    try {
      return await this.MetaBoxActor.getDataBoxVersion() as bigint
    } catch (e) {
      throw e
    }
  }

  /**
   * 修改Box Info
   *
   * @param {BoxInfo__1} BoxInfo__1 Box 最新的Info
   *
   */
  async updateBoxInfo(BoxInfo__1: BoxInfo__1): Promise<Result> {
    try {
      return await this.MetaBoxActor.updateBoxInfo(BoxInfo__1) as Result
    } catch (e) {
      throw e
    }
  }


  /**
   * 创建Box并指定Box controller
   *
   *
   * @param  {Omit<BoxMetadata, "box_type">} arg Box Info
   * @param {Identity} controller option 控制权给xxx
   * @param {Props} props option 代币
   */
  createBoxWithController(arg: Omit<BoxMetadata, "box_type">, controller?: Identity, props?: Props) {
    return new Promise<BoxID>(async (resolve, reject) => {
      try {
        if (props) return reject("coming soon")
        const res = await this._createBoxWithController({...arg, box_type: {data_box: null}}, controller)
        return resolve(res)
      } catch (e) {
        throw e
      }
    })
  }

  /**
   * 取消分享Box
   *
   * @param {BoxID} box_id Box ID
   * @param {Identity} who 取消分享给谁
   */
  async cancelShareBox(box_id: BoxID, who: Identity) {
    try {
      if (!("ICP" in who)) throw new Error("coming soon")
      const databoxApi = new Box(box_id.toString(), this.agent)
      const res = await Promise.all([this._cancelShareBox(box_id, who), databoxApi.deleteBoxController(who)])
      const [res_1, res_2] = res
      if ("ok" in res_1) return true
      Promise.all([this._cancelShareBox(box_id, who), databoxApi.deleteBoxController(who)]).then()
      if ("err" in res_1) throw new Error(Object.keys(res_1.err)[0])
      if ("err" in res_2) throw new Error(Object.keys(res_2.err)[0])
      return false
    } catch (e) {
      throw e
    }
  }


  /**
   *
   * 分享Box
   *
   * @param {BoxID} box_id Box ID
   * @param {Identity} to 给谁
   */
  async shareBox(box_id: BoxID, to: Identity) {
    try {
      if (!("ICP" in to)) throw new Error("coming soon")
      const databoxApi = new Box(box_id.toString(), this.agent)
      const res = await Promise.all([this._emitShareBox(box_id, to), databoxApi.addBoxController(to)])
      const [res_1, res_2] = res
      if ("ok" in res_1 && "ok" in res_2) return true
      Promise.all([this._cancelShareBox(box_id, to), databoxApi.addBoxController(to)]).then()
      if ("err" in res_1) throw new Error(Object.keys(res_1.err)[0])
      if ("err" in res_2) throw new Error(Object.keys(res_2.err)[0])
      return false
    } catch (e) {
      throw e
    }
  }

  /**
   * 转移Box
   *
   * @param {BoxID} box_id BoxID
   * @param {Identity} to 给谁
   */
  async transferBox(box_id: BoxID, to: Identity) {
    try {
      if (!("ICP" in to)) throw new Error("coming soon")
      const databoxApi = new Box(box_id.toString(), this.agent)
      const res = await Promise.all([this._transferBoxOwner(box_id, to), databoxApi.transferBoxOwner(to)])
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
