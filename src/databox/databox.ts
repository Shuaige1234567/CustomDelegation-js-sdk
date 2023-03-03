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
import {nanoid} from "nanoid";
import random from "string-random"
import {Principal} from "@dfinity/principal";
import {changePlainFilePermissionArg, shareFileArg} from "../types";
import {AESEncryptApi, EncryptApi, RSAEncryptApi} from "../utils";
import {MetaBox, Wallet} from "../metabox";
import {
  uploadEncryptedArrayBuffer,
  uploadEncryptedFile, uploadEncryptedText,
  uploadPlainArrayBuffer,
  uploadPlainFile,
  uploadPlainText
} from "./util";


export const chunkSize = 1992288
const ONE_BYTE_UPLOAD_USE_CYCLES = 2260

export type everPayToken = "BNB" | "AR" | "USDT" | "ETH"

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

export class DataBox {
  private readonly agent: HttpAgent
  private readonly DataBoxActor: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>>

  constructor(canisterId: string, agent: HttpAgent) {
    this.agent = agent
    this.DataBoxActor = Actor.createActor(idlFactory, {agent, canisterId})
  }

  private async _putFileToIC(props: {
    dataArr: DataType[],
    isPrivate: boolean,
    fileType: fileType,
    keyArr?: string[]
  }): Promise<string[]> {
    const {dataArr, isPrivate, fileType, keyArr} = props
    try {
      const Actor = this.DataBoxActor
      const allPromise: Array<Promise<any>> = []
      const _keyArr: string[] = []
      for (let i = 0; i < dataArr.length; i++) {
        const data = dataArr[i]
        const key = keyArr ? keyArr[i] : nanoid()
        _keyArr.push(key)
        const args = {key, isPrivate, Actor, allPromise}
        if (data instanceof File || data instanceof Blob) {
          fileType === "Plaintext" ? await uploadPlainFile(data, args) : await uploadEncryptedFile(data, fileType.Encrypted.publicKey, args)
        } else if (data instanceof Uint8Array) {
          fileType === "Plaintext" ? await uploadPlainArrayBuffer(data, args) : await uploadEncryptedArrayBuffer(data, fileType.Encrypted.publicKey, args)
        } else {
          fileType === "Plaintext" ? await uploadPlainText(data, args) : await uploadEncryptedText(data, fileType.Encrypted.publicKey, args)
        }
      }
      await Promise.all(allPromise)
      return _keyArr
    } catch (e) {
      throw e
    }
  }

  private async _putPlainFilesToIC(props: {
    dataArr: DataType[],
    isPrivate: boolean,
    keyArr?: string[]
  }): Promise<string[]> {
    try {
      return await this._putFileToIC({...props, fileType: "Plaintext"})
    } catch (e) {
      throw e
    }
  }

  private async _putEncryptFilesToIC(props: {
    dataArr: DataType[],
    publicKey: string,
    keyArr?: string[]
  }): Promise<string[]> {
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
        const metadata = await DataBox.getFile(dataArr, fileSize)
        if (fileType === "Uint8Array") return metadata
        if (fileType === "text/plain") return new TextDecoder().decode(metadata)
        return new Blob([metadata.buffer], {
          type: fileType,
        })
      } else throw new Error(Object.keys(res[0].err)[0])
    } catch (e) {
      throw e
    }
  }

  private async _getICEncrypted(assetExt: AssetExt, privateKey: string) {
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
        const metadata = await DataBox.getFile(dataArr, fileSize)
        const importedPrivateKey = await RSAEncryptApi.importPrivateKey(privateKey);
        const preFileAesKey = await RSAEncryptApi.decryptMessage(
          importedPrivateKey,
          assetExt.aes_pub_key[0]
        );
        const AesKey = preFileAesKey.slice(0, 256);
        const AesIv = preFileAesKey.slice(256);
        const plainText = AESEncryptApi.AESDecData(metadata, AesKey, AesIv);
        if (fileType === "Uint8Array") return plainText
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

  static async FileRead(file: File | Blob): Promise<Uint8Array[]> {
    try {
      return new Promise((resolve, reject) => {
        let start = 0;
        let currentChunk = 0;
        const total_index = Math.ceil(file.size / chunkSize)
        const allData: Array<Uint8Array> = []
        let reader = new FileReader();
        reader.onload = async function (e: any) {
          allData.push(new Uint8Array(e.target.result))
          if (currentChunk === total_index) return resolve(allData)
          else loadChunk()
        }
        reader.onerror = (error) => {
          reject(error)
        }
        const loadChunk = () => {
          const end = start + chunkSize;
          currentChunk++;
          reader.readAsArrayBuffer(file.slice(start, end));
          start = end;
        };
        loadChunk();
      })
    } catch (e) {
      throw e
    }
  }

  static async encryptFileData(data: Uint8Array, publicKey: string) {
    try {
      const AESKEY = await EncryptApi.aesKeyGen();
      const AESIv = random(128);
      const encData = AESEncryptApi.AESEncData(
        data,
        AESKEY,
        AESIv
      );
      const encryptedAesKey = await RSAEncryptApi.encryptMessage(
        publicKey,
        `${AESKEY}${AESIv}`
      );
      return {encData, encryptedAesKey}
    } catch (e) {
      throw e
    }
  }

  static async getFile(decodeArr: any, length: number): Promise<Uint8Array> {
    const File = new Uint8Array(length)
    for (let i = 0; i < decodeArr.length; i++) {
      let slice = decodeArr[i]
      let start = 0
      for (let j = 0; j < i; j++) {
        start += decodeArr[j].length
      }
      File.set(slice, start)
    }
    return File
  }

  public async boxState(): Promise<Result_10> {
    try {
      return await this.DataBoxActor.canisterState() as Result_10
    } catch (e) {
      throw e
    }
  }

  public async cycleBalance(): Promise<Result_7> {
    try {
      return await this.DataBoxActor.cycleBalance() as Result_7
    } catch (e) {
      throw e
    }
  }

  public putPlaintext(props: {
    dataArr: DataType[],
    isPrivate: boolean,
    chain: Chain,
    keyArr?: string[]
  }) {
    const {keyArr, chain, dataArr} = props
    return new Promise<string[]>(async (resolve, reject) => {
      if (keyArr && keyArr.length !== dataArr.length) return reject("文件数量与key数量不匹配")
      if (chain !== "icp") return reject("coming soon")
      try {
        const res = await this._putPlainFilesToIC({...props})
        return resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  public putEncrypted(props: {
    dataArr: DataType[],
    chain: Chain,
    publicKey: string,
    keyArr?: string[]
  }) {
    const {keyArr, chain, dataArr} = props
    return new Promise<string[]>(async (resolve, reject) => {
      if (keyArr && keyArr.length !== dataArr.length) return reject("文件数量与key数量不匹配")
      if (chain !== "icp") return reject("coming soon")
      try {
        const res = await this._putEncryptFilesToIC({...props})
        return resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }


  public async getPlaintext(fileKey: string): Promise<Blob | string | Uint8Array> {
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

  public async getEncryptedFile(fileKey: string, privateKey: string): Promise<Blob | string | Uint8Array> {
    try {

      const file_info = await this.getFileInfo(fileKey)
      if ("ok" in file_info) {
        if ("EncryptFileExt" in file_info.ok) {
          const location = file_info.ok.EncryptFileExt.page_field
          if ("Arweave" in location || "IPFS" in location) throw new Error("coming soon")
          return await this._getICEncrypted(file_info.ok.EncryptFileExt, privateKey)
        } else throw new Error("this is not a encrypted file")
      } else throw new Error(Object.keys(file_info.err)[0])
    } catch (e) {
      throw e
    }
  }

  public async deletePlaintext(fileKey: string): Promise<Result_1> {
    try {
      return await this.DataBoxActor.deleteFileFromKey(fileKey, {'Plain': null}) as Result_1
    } catch (e) {
      throw e
    }
  }

  public async deleteEncryptedFile(fileKey: string): Promise<Result_1> {
    try {
      return await this.DataBoxActor.deleteFileFromKey(fileKey, {'EnCrypt': null}) as Result_1
    } catch (e) {
      throw e
    }
  }

  public async clearBox(): Promise<Result_1> {
    try {
      return await this.DataBoxActor.clearall() as Result_1
    } catch (e) {
      throw e
    }
  }

  public async getFileInfo(fileKey: string): Promise<Result_2> {
    try {
      return await this.DataBoxActor.getAssetextkey(fileKey) as Result_2
    } catch (e) {
      throw e
    }
  }

  public async getBoxVersion(): Promise<bigint> {
    try {
      return await this.DataBoxActor.getVersion() as bigint
    } catch (e) {
      throw e
    }
  }

  public async getAllFilesInfo(): Promise<Result_9> {
    try {
      return await this.DataBoxActor.getAssetexts() as Result_9
    } catch (e) {
      throw e
    }
  }

  async transferOwner(to: Principal): Promise<Result_1> {
    try {
      return await this.DataBoxActor.transferOwner(to) as Result_1
    } catch (e) {
      throw e
    }
  }

  public async getOwner(): Promise<Principal> {
    try {
      return await this.DataBoxActor.getOwner() as Principal
    } catch (e) {
      throw e
    }
  }

  public async setPlainFilePubOrPri(changePlainFilePermissionArg: changePlainFilePermissionArg): Promise<Result_1> {
    try {
      return await this.DataBoxActor.setPlainFilePubOrPri(changePlainFilePermissionArg.file_key, changePlainFilePermissionArg.is_private) as Result_1
    } catch (e) {
      throw e
    }
  }

  public async addPrivatePlainShare(shareFileArg: shareFileArg): Promise<Result_1> {
    try {
      return await this.DataBoxActor.addPrivatePlainShare(shareFileArg.file_key, shareFileArg.to) as Result_1
    } catch (e) {
      throw e
    }
  }

  public async removePrivatePlainShare(shareFileArg: shareFileArg): Promise<Result_1> {
    try {
      return await this.DataBoxActor.removePrivatePlainShare(shareFileArg.file_key, shareFileArg.to) as Result_1
    } catch (e) {
      throw e
    }
  }

  public async getShareFiles(): Promise<Result_3> {
    try {
      return await this.DataBoxActor.getShareFiles() as Result_3
    } catch (e) {
      throw e
    }
  }

  public async isNeedUpgrade(): Promise<boolean> {
    try {
      const MBapi = new MetaBox(this.agent)
      const version = Number(await this.getBoxVersion())
      const new_version = Number(await MBapi.getBoxLatestVersion())
      return version < new_version
    } catch (e) {
      throw e
    }
  }

  public async isEnoughToUpload(totalSize: number): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      try {
        const res = await this.cycleBalance()
        if ("ok" in res) {
          const balance = Number(res.ok)
          if (totalSize * ONE_BYTE_UPLOAD_USE_CYCLES < balance) {
            return resolve(true)
          } else return reject(Number(totalSize * ONE_BYTE_UPLOAD_USE_CYCLES - balance))
        } else return reject(String(Object.keys(res.err)[0]))
      } catch (e) {
        return reject(e)
      }
    })
  }

  async addCon(to: Principal): Promise<Result_1> {
    try {
      const Actor = this.DataBoxActor;
      return await Actor.addCon(to) as Result_1
    } catch (e) {
      throw e
    }
  }

  async deleteCon(to: Principal): Promise<Result_1> {
    try {
      const Actor = this.DataBoxActor;
      return await Actor.deleteCon(to) as Result_1
    } catch (e) {
      throw e
    }
  }

  /**
   *
   * @param {FileLocation} fileLocation 文件位置
   * @return {Result_7} 数据个数
   */
  public async getFileNums(fileLocation: FileLocation): Promise<Result_7> {
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
   * @param {number} onePageFileNums 每一页的数据大小 不能超过5000
   * @param {number} pageIndex 取哪一页
   * @example
   * getPageFiles({Plain:null},2,0) 取明文数据，每一页有两个数据，取第一页
   */
  public getPageFiles(fileLocation: FileLocation, onePageFileNums: number, pageIndex: number) {
    return new Promise<FileExt[]>(async (resolve, reject) => {
      try {
        if (onePageFileNums > 5000) return reject("A page of data cannot exceed 5000")
        const res = await this.DataBoxActor.getPageFiles(fileLocation, BigInt(onePageFileNums), BigInt(pageIndex)) as Result_5
        if ("ok" in res) return resolve(res.ok)
        else return reject(Object.keys(res.err)[0])
      } catch (e) {
        throw e
      }
    })
  }

}
