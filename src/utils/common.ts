import {Buffer} from "buffer";
import {toHexString} from "@dfinity/candid";
import {getCrc32} from "@dfinity/principal/lib/cjs/utils/getCrc";
import * as SHA1 from "@dfinity/principal/lib/cjs/utils/sha224";

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
