import {Buffer} from "buffer";
import {toHexString} from "@dfinity/candid";
import {getCrc32} from "@dfinity/principal/lib/cjs/utils/getCrc";
import * as SHA1 from "@dfinity/principal/lib/cjs/utils/sha224";
import {EncryptApi} from "./Encrypt";
import random from "string-random";
import {AESEncryptApi} from "./AESEncrypt";
import {RSAEncryptApi} from "./RSAEncrypt";

export const chunkSize = 1992288
const endpoint = "https://data.binance.com/api/v3"
export const ArrayToHexString = (byteArray: number[]) => {
  return Array.from(byteArray, function (byte) {
    return ("0" + (byte & 0xff).toString(16)).slice(-2);
  }).join("");
};


export const getUint8ArrayFromHex = (str) => {
  return Uint8Array.from(Buffer.from(str, "hex"));
};


export const getToAccountIdentifier = (principal, s) => {
  const padding = new Buffer("\x0Aaccount-id");
  const array = new Uint8Array([
    ...padding,
    ...principal.toUint8Array(),
    ...getPrincipalSubAccountArray(s),
  ]);
  const hash = SHA1.sha224(array);
  const checksum = to32bits(getCrc32(hash));
  const array2 = new Uint8Array([...checksum, ...hash]);
  return toHexString(array2);
};

const getPrincipalSubAccountArray = (principal) => {
  const p = Array.from(principal.toUint8Array());
  let tmp = Array(1).fill(p.length).concat(p);
  while (tmp.length < 32) tmp.push(0);
  return tmp;
};

const to32bits = (num) => {
  let b = new ArrayBuffer(4);
  new DataView(b).setUint32(0, num);
  return Array.from(new Uint8Array(b));
};

export const getEHTICPSymbol = async (needICP: number): Promise<number> => {
  const url = `${endpoint}/ticker/price?symbols=%5B%22ETHUSDT%22,%22ICPUSDT%22%5D`
  const res = await fetch(url)
  const json_res = await res.json()
  const ICPPrice = json_res[1].price
  const ETHPrice = json_res[0].price
  const ICPETH = ICPPrice / ETHPrice
  return needICP * ICPETH
}

export const getTokenPrice = async (token: string): Promise<number> => {
  try {
    const uppercaseToken = token.toUpperCase()
    const url = `${endpoint}/ticker/price?symbol=${uppercaseToken}USDT`
    const res = await fetch(url)
    const json_res = await res.json()
    if (json_res.symbol !== `${uppercaseToken}USDT`) throw new Error("symbol error")
    return Number(json_res.price)
  } catch (e) {
    throw e
  }
}


export const FileRead = async (file: File | Blob): Promise<Uint8Array[]> => {
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

export const encryptFileData = async (data: Uint8Array, publicKey: string) => {
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

export const getFile = async (decodeArr: any, length: number): Promise<Uint8Array> => {
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

export const sleep = (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

interface retry_type<T> {
  data: T,
  index: number
}

export const retry = async <T>(promise_arr: (() => Promise<retry_type<T>>)[], maxRetries: number, success_arr: retry_type<T>[] = new Array(promise_arr.length).fill(undefined)): Promise<retry_type<T>[]> => {
  return new Promise<retry_type<T>[]>(async (resolve, reject) => {
    try {
      const all_promise: Promise<retry_type<T>>[] = []
      const new_arr: (() => Promise<retry_type<T>>)[] = []
      for (let i = 0; i < promise_arr.length; i++) {
        all_promise.push(promise_arr[i]())
      }
      const res = await Promise.allSettled(all_promise)
      for (let i = 0; i < res.length; i++) {
        const item = res[i]
        if (item.status === "fulfilled") success_arr[item.value.index] = item.value
        else new_arr.push(promise_arr[i])
      }
      if (success_arr.every(e => !!e)) return resolve(success_arr)
      if (maxRetries <= 0) {
        const message = "reason" in res[0] ? res[0].reason : "执行失败"
        return reject(message)
      }
      maxRetries--;
      const result = await retry(new_arr, maxRetries, success_arr)
      return resolve(result)
    } catch (e) {
      reject(e)
    }
  })
}
