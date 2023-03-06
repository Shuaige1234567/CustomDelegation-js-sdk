import {idlFactory} from "./did/databox"
import {Actor, ActorMethod, ActorSubclass, HttpAgent} from "@dfinity/agent";
import {
  AssetExt,
  FileExt,
  FileLocation,
  Result_1,
  Result_10,
  Result_2,
  Result_3,
  Result_5,
  Result_7,
  Result_9
} from "./did/databox_type";
import {Principal as BoxID} from "@dfinity/principal";
import {changePlainFilePermissionArg, shareFileArg} from "../types";
import {AESEncryptApi, getFile, RSAEncryptApi} from "../utils";
import {MetaBox, Wallet} from "../metabox";
import {
  uploadEncryptedArrayBuffer,
  uploadEncryptedFile, uploadEncryptedText,
  uploadPlainArrayBuffer,
  uploadPlainFile,
  uploadPlainText
} from "./util";

type UserID = BoxID
export type everPayToken = "BNB" | "AR" | "USDT" | "ETH"

export type Identity = { EVM: string } | { ICP: UserID } | { Other: string }

type fileType = {
  Encrypted: {
    publicKey: string
  }
} | "Plaintext"

export type Chain = "icp" | {
  arweave: {
    token: everPayToken,
    wallet: Wallet
  }
} | "ipfs" | "bnb"

export type DataType = File | string | Blob | Uint8Array

export class Box {
  private readonly agent: HttpAgent
  private readonly DataBoxActor: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>>

  constructor(boxId: string, agent: HttpAgent) {
    this.agent = agent
    this.DataBoxActor = Actor.createActor(idlFactory, {agent, canisterId: boxId})
  }

  private async _putFileToIC(props: {
    data: DataType,
    isPrivate: boolean,
    fileType: fileType,
    fileKey?: string
  }): Promise<string> {
    const {data, isPrivate, fileType, fileKey} = props
    try {
      const Actor = this.DataBoxActor
      const {nanoid} = await import('nanoid');
      const key = fileKey ? fileKey : nanoid()
      const args = {key, isPrivate, Actor, dataBox: this}
      if (data instanceof File || data instanceof Blob) {
        fileType === "Plaintext" ? await uploadPlainFile(data, args) : await uploadEncryptedFile(data, fileType.Encrypted.publicKey, args)
      } else if (data instanceof Uint8Array) {
        fileType === "Plaintext" ? await uploadPlainArrayBuffer(data, args) : await uploadEncryptedArrayBuffer(data, fileType.Encrypted.publicKey, args)
      } else {
        fileType === "Plaintext" ? await uploadPlainText(data, args) : await uploadEncryptedText(data, fileType.Encrypted.publicKey, args)
      }
      return key
    } catch (e) {
      throw e
    }
  }

  private async _putPlainFileToIC(props: {
    data: DataType,
    isPrivate: boolean,
    fileKey?: string
  }): Promise<string> {
    try {
      return await this._putFileToIC({...props, fileType: "Plaintext"})
    } catch (e) {
      throw e
    }
  }

  private async _putEncryptFilesToIC(props: {
    data: DataType,
    publicKey: string,
    fileKey?: string
  }): Promise<string> {
    const {publicKey} = props
    try {
      return await this._putFileToIC({
        ...props, isPrivate: true, fileType: {
          Encrypted: {
            publicKey
          }
        }
      })
    } catch (e) {
      throw e
    }
  }

  private async _getICPlaintext(assetExt: AssetExt) {
    try {
      const dataArr: Array<Array<number>> = []
      let fileSize = 0
      const fileType = assetExt.file_extension
      const res = await this._getData({PlainFileExt: assetExt}, false)
      if (res[0] && res[0].ok) {
        res.forEach(e => {
          dataArr.push(e.ok)
          fileSize += e.ok.length
        })
        const metadata = await getFile(dataArr, fileSize)
        if (fileType === "uint8array") return metadata
        if (fileType === "text/plain") return new TextDecoder().decode(metadata)
        return new Blob([metadata.buffer], {
          type: fileType,
        })
      } else throw new Error(Object.keys(res[0].err)[0])
    } catch (e) {
      throw e
    }
  }

  private async _getICCiphertext(assetExt: AssetExt, privateKey: string) {
    try {
      const dataArr: Array<Array<number>> = []
      let fileSize = 0
      const fileType = assetExt.file_extension
      const res = await this._getData({EncryptFileExt: assetExt}, true)
      if (res[0] && res[0].ok) {
        res.forEach(e => {
          e.ok.forEach(value => {
            dataArr.push(value)
            fileSize += value.length
          })
        })
        const metadata = await getFile(dataArr, fileSize)
        const importedPrivateKey = await RSAEncryptApi.importPrivateKey(privateKey);
        const preFileAesKey = await RSAEncryptApi.decryptMessage(
          importedPrivateKey,
          assetExt.aes_pub_key[0]
        );
        const AesKey = preFileAesKey.slice(0, 256);
        const AesIv = preFileAesKey.slice(256);
        const plainText = AESEncryptApi.AESDecData(metadata, AesKey, AesIv);
        if (fileType === "uint8array") return plainText
        if (fileType === "text/plain") return new TextDecoder().decode(plainText)
        return new Blob([plainText.buffer], {
          type: fileType,
        })
      } else throw new Error(Object.keys(res[0].err)[0])
    } catch (e) {
      throw e
    }
  }

  private async _getData(file_info: FileExt, isEncrypt: boolean): Promise<Array<any>> {
    try {
      const queryPromiseArr: Array<Promise<any>> = []
      const AssetExt = file_info[isEncrypt ? "EncryptFileExt" : "PlainFileExt"]
      if (AssetExt) {
        const need_query_times = Number(AssetExt.need_query_times)
        for (let i = 0; i < need_query_times; i++) {
          queryPromiseArr.push(this.DataBoxActor[isEncrypt ? "getCipher" : "getPlain"]({
            file_key: AssetExt.file_key,
            flag: BigInt(i)
          }))
        }
        return await Promise.all(queryPromiseArr)
      } else throw new Error(`this is not a ${isEncrypt ? "encrypt" : "plain"} file`)
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取Box 状态
   * @return {Result_10}
   */
  async boxState(): Promise<Result_10> {
    try {
      return await this.DataBoxActor.canisterState() as Result_10
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取Box cycle剩余
   * @return {Result_7}
   */
  async cycleBalance(): Promise<Result_7> {
    try {
      return await this.DataBoxActor.cycleBalance() as Result_7
    } catch (e) {
      throw e
    }
  }

  /**
   * 上传明文文件
   *
   * @param props
   * @return {string} fileKey
   *
   * @example
   * uploadPlaintextFile({
   *   data: "hello world",
   *   isPrivate: true,
   *   chain: "icp",
   *   fileKey: "test" // 指定这个文件的fileKey
   * })
   *
   */
  uploadPlaintextFile(props: {
    data: DataType,
    isPrivate: boolean,
    chain: Chain,
    fileKey?: string
  }) {
    const {chain} = props
    return new Promise<string>(async (resolve, reject) => {
      if (chain !== "icp") return reject("coming soon")
      try {
        const res = await this._putPlainFileToIC({...props})
        return resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * 上传密文文件
   *
   * @param props
   */
  uploadCiphertextFile(props: {
    data: DataType,
    chain: Chain,
    publicKey: string,
    fileKey?: string
  }) {
    const {chain} = props
    return new Promise<string>(async (resolve, reject) => {
      if (chain !== "icp") return reject("coming soon")
      try {
        const res = await this._putEncryptFilesToIC({...props})
        return resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }


  /**
   *
   * 获取明文文件
   *
   * @param { string } fileKey
   * @return {Blob | string | Uint8Array} 根据此文件的类型返回相应类型
   *
   */
  async getPlaintextFile(fileKey: string): Promise<Blob | string | Uint8Array> {
    try {
      const file_info = await this.getFileInfo(fileKey)
      if ("ok" in file_info) {
        if ("PlainFileExt" in file_info.ok) {
          const location = file_info.ok.PlainFileExt.page_field
          if ("Arweave" in location || "IPFS" in location) throw new Error("coming soon")
          return await this._getICPlaintext(file_info.ok.PlainFileExt)
        } else throw new Error("this is not a plain file")
      } else throw new Error(Object.keys(file_info.err)[0])
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * @param fileKey
   * @param privateKey
   */
  async getCiphertextFile(fileKey: string, privateKey: string): Promise<Blob | string | Uint8Array> {
    try {

      const file_info = await this.getFileInfo(fileKey)
      if ("ok" in file_info) {
        if ("EncryptFileExt" in file_info.ok) {
          const location = file_info.ok.EncryptFileExt.page_field
          if ("Arweave" in location || "IPFS" in location) throw new Error("coming soon")
          return await this._getICCiphertext(file_info.ok.EncryptFileExt, privateKey)
        } else throw new Error("this is not a encrypted file")
      } else throw new Error(Object.keys(file_info.err)[0])
    } catch (e) {
      throw e
    }
  }

  /**
   * 删除明文文件
   *
   * @param fileKey
   */
  async deletePlaintextFile(fileKey: string): Promise<Result_1> {
    try {
      return await this.DataBoxActor.deleteFileFromKey(fileKey, {'Plain': null}) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   * 删除密文文件
   *
   * @param fileKey
   */
  async deleteCiphertextFile(fileKey: string): Promise<Result_1> {
    try {
      return await this.DataBoxActor.deleteFileFromKey(fileKey, {'EnCrypt': null}) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   * 删除Box所以文件
   *
   */
  async clearBox(): Promise<Result_1> {
    try {
      return await this.DataBoxActor.clearall() as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * 获取指定file的信息
   *
   * @param {string} fileKey
   * @return {Result_2}
   */
  async getFileInfo(fileKey: string): Promise<Result_2> {
    try {
      return await this.DataBoxActor.getAssetextkey(fileKey) as Result_2
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取Box的版本
   *
   */
  async getBoxVersion(): Promise<bigint> {
    try {
      return await this.DataBoxActor.getVersion() as bigint
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取Box中所有文件信息
   *
   * @return {Result_9}
   */
  async getAllFileInfo(): Promise<Result_9> {
    try {
      return await this.DataBoxActor.getAssetexts() as Result_9
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取Box中所有密文文件信息
   *
   * @return {AssetExt[]}
   *
   */
  async getAllCiphertextFileInfo(): Promise<AssetExt[]> {
    const res = await this.getAllFileInfo()
    if ("err" in res) throw new Error(Object.keys(res.err)[0])
    const encryptFile: AssetExt[] = [];
    for (let i = 0; i < res.ok[1].length; i++) {
      const fileExt: FileExt = res.ok[1][i]
      if ("EncryptFileExt" in fileExt) encryptFile.push(fileExt.EncryptFileExt)
      else throw new Error("not a encrypted file")
    }
    return encryptFile
  }

  /**
   * 获取Box中所有明文文件信息
   *
   * @return {AssetExt[]}
   *
   */
  async getAllPlaintextFileInfo(): Promise<AssetExt[]> {
    const res = await this.getAllFileInfo()
    const plainFile: AssetExt[] = [];
    if ("err" in res) throw new Error(Object.keys(res.err)[0])
    for (let i = 0; i < res.ok[0].length; i++) {
      const fileExt: FileExt = res.ok[0][i]
      if ("PlainFileExt" in fileExt) plainFile.push(fileExt.PlainFileExt)
      else throw new Error("not a plaintext file")
    }
    return plainFile
  }


  /**
   * 转移Box owner
   *
   * @param to
   */
  async transferBoxOwner(to: Identity): Promise<Result_1> {
    try {
      if ("ICP" in to) return await this.DataBoxActor.transferOwner(to.ICP) as Result_1
      throw new Error("coming soon")
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * 获取Box owner
   *
   */
  async getBoxOwner(): Promise<BoxID> {
    try {
      return await this.DataBoxActor.getOwner() as BoxID
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * 设置明文文件是否 private
   *
   * @param {changePlainFilePermissionArg} changePlainFilePermissionArg
   *
   */
  async setPlaintextFileVisibility(changePlainFilePermissionArg: changePlainFilePermissionArg): Promise<Result_1> {
    try {
      return await this.DataBoxActor.setPlainFilePubOrPri(changePlainFilePermissionArg.file_key, changePlainFilePermissionArg.is_private) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * 分享明文但是private的文件
   *
   * @param shareFileArg
   */
  async sharePrivatePlaintextFile(shareFileArg: shareFileArg): Promise<Result_1> {
    try {
      return await this.DataBoxActor.addPrivatePlainShare(shareFileArg.file_key, shareFileArg.to) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   * 取消分享
   *
   * @param shareFileArg
   */
  async cancelSharePrivatePlaintextFile(shareFileArg: shareFileArg): Promise<Result_1> {
    try {
      return await this.DataBoxActor.removePrivatePlainShare(shareFileArg.file_key, shareFileArg.to) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   * 获取分享出去的所有文件信息
   *
   * @return {Result_3}
   *
   */
  async getShareFiles(): Promise<Result_3> {
    try {
      return await this.DataBoxActor.getShareFiles() as Result_3
    } catch (e) {
      throw e
    }
  }

  /**
   * 判断是否Box需要更新
   *
   */
  async isNeedUpgrade(): Promise<boolean> {
    try {
      const MBapi = new MetaBox(this.agent)
      const version = Number(await this.getBoxVersion())
      const new_version = Number(await MBapi.getBoxLatestVersion())
      return version < new_version
    } catch (e) {
      throw e
    }
  }


  /**
   * 给Box增加controller
   *
   * @param who
   */
  async addBoxController(who: Identity): Promise<Result_1> {
    try {
      if (!("ICP" in who)) throw new Error("coming soon")
      const Actor = this.DataBoxActor;
      return await Actor.addCon(who.ICP) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   * 删除Box 指定Controller
   *
   * @param who
   */
  async deleteBoxController(who: Identity): Promise<Result_1> {
    try {
      if (!("ICP" in who)) throw new Error("coming soon")
      const Actor = this.DataBoxActor;
      return await Actor.deleteCon(who.ICP) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * @param {FileLocation} fileLocation 文件位置
   * @return {Result_7} 数据个数
   */
  async getFileCount(fileLocation: FileLocation): Promise<Result_7> {
    try {
      return await this.DataBoxActor.getFileNums(fileLocation) as Result_7
    } catch (e) {
      throw e
    }
  }

  /**
   * 分页get数据
   *
   * @param {FileLocation} fileLocation 文件位置
   * @param {number} onePageFileCount 每一页的数据大小 不能超过5000
   * @param {number} pageIndex 取哪一页
   * @example
   * getFilesOfPage({Plain:null},2,0) 取明文数据，每一页有两个数据，取第一页
   */
  getFilesOfPage(fileLocation: FileLocation, onePageFileCount: number, pageIndex: number) {
    return new Promise<FileExt[]>(async (resolve, reject) => {
      try {
        if (onePageFileCount > 5000) return reject("A page of data cannot exceed 5000")
        const res = await this.DataBoxActor.getPageFiles(fileLocation, BigInt(onePageFileCount), BigInt(pageIndex)) as Result_5
        if ("ok" in res) return resolve(res.ok)
        else return reject(Object.keys(res.err)[0])
      } catch (e) {
        throw e
      }
    })
  }

}
