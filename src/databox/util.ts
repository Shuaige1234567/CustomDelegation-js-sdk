import {AssetExt, FilePut, Result_2, State} from "./did/databox_type";
import {
  ActorMethod,
  SubmitResponse,
  ActorSubclass,
  Certificate,
  Actor,
  RequestId,
  RequestStatusResponseStatus,
  toHex
} from "@dfinity/agent";
import {IDL} from "@dfinity/candid";
import {FuncClass} from "@dfinity/candid/lib/cjs/idl";
import {idlFactory} from "./did/databox"
import {chunkSize, encryptFileData, FileRead, retry, sleep} from "../utils";
import {Box} from "./databox";

interface Func {
  methodName: string,
  func: FuncClass
}

type Props = {
  key: string,
  isPrivate: boolean,
  Actor: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>>,
  dataBox: Box
}

export const memory_threshold = 40 * 1024 * 1024 * 1024  // 40G

const getFunc = async (theIDL: Function, method: string): Promise<Func> => {
  const service = theIDL({IDL})
  for (const [methodName, func] of service._fields) {
    if (methodName === method) {
      return {
        methodName: methodName,
        func: func
      }
    }
  }
  throw new Error("该did没有这个方法")
}
const put_on_file = async (isEncrypt: boolean, methodName: string, one_file_args: ArrayBuffer[], file_key: string, DataBoxActor: Actor, dataBox: Box) => {
  return new Promise<boolean>(async (resolve, reject) => {
    try {
      const res = await launch_and_check_one_file(isEncrypt, methodName, one_file_args, file_key, DataBoxActor, dataBox)
      return resolve(res)
    } catch (e) {
      reject(e)
    }
  })
}
const launch_and_check_one_file = (isEncrypt: boolean, methodName: string, args: ArrayBuffer[], all_file_key: string, DataBoxActor: Actor, dataBox: Box, maxRetries: number = 3): Promise<boolean> => {
  return new Promise<boolean>(async (resolve, reject) => {
    try {
      const allChunkNumber = args.length
      const IsItPossible = await checkState(args.length, dataBox)
      if (!IsItPossible) return reject("cycles is not enough")
      const all_request_id = await call_all(methodName, args, DataBoxActor)
      const is_success = await turn_upload_file(isEncrypt, [all_file_key], allChunkNumber, dataBox)
      if (is_success) {
        return resolve(true)
      } else {
        if (maxRetries <= 0) return reject("上传失败..")
        const res = await check_by_read_state(all_request_id, DataBoxActor)
        const {new_args} = get_new_args(args, res)
        maxRetries--;
        return await launch_and_check_one_file(isEncrypt, methodName, new_args, all_file_key, DataBoxActor, dataBox, maxRetries)
      }
    } catch (e) {
      reject(e)
    }
  })
}

const one_call = (methodName: string, arg: ArrayBuffer, index: number, DataBoxActor: Actor) => {
  return (): Promise<{ data: SubmitResponse, index: number }> => {
    return new Promise(async (resolve, reject) => {
      const agent = Actor.agentOf(DataBoxActor);
      const cid = Actor.canisterIdOf(DataBoxActor)
      if (!agent) return reject("agent error")
      const response = await agent.call(cid, {
        methodName,
        arg: arg,
        effectiveCanisterId: cid,
      })
      if (response.response.ok) return resolve({data: response, index})
      else return reject("call failed")
    })
  }
}

const call_all = async (methodName: string, args: ArrayBuffer[], DataBoxActor: Actor): Promise<RequestId[]> => {
  return new Promise(async (resolve, reject) => {
    try {
      const chunkPromises = new Array<() => Promise<{ data: SubmitResponse, index: number }>>();
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (i !== 0 && i % 30 === 0) await sleep(2000)
        chunkPromises.push(one_call(methodName, arg, i, DataBoxActor))
      }
      const res = await retry<SubmitResponse>(chunkPromises, 3)
      const all_request_id: RequestId[] = []
      res.forEach(e => all_request_id.push(e.data.requestId))
      return resolve(all_request_id)
    } catch (e) {
      reject("call failed")
    }
  })
}

const turn_upload_file = async (isEncrypt: boolean, all_keys: string[], all_chunks: number, dataBox: Box): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      let count = 0
      const query_times = Math.ceil(all_chunks / 2) + 10
      const timer = setInterval(async () => {
        if (count === query_times) {
          clearInterval(timer)
          return resolve(false)
        }
        count++;
        const res = await check(all_keys, dataBox)
        if (res) {
          clearInterval(timer)
          return resolve(true)
        }
      }, 2000)
    } catch (e) {
      reject(e)
    }
  })
}

type read_state = "received" | "processing" | "replied" | "rejected" | "unknown" | "done"

function decodeReturnValue(types: IDL.Type[], msg: ArrayBuffer) {
  const returnValues = IDL.decode(types, Buffer.from(msg));
  switch (returnValues.length) {
    case 0:
      return undefined;
    case 1:
      return returnValues[0];
    default:
      return returnValues;
  }
}

const read_state = (requestId: RequestId, index: number, DataBoxActor: Actor) => {
  return () => {
    return new Promise<{ data: read_state, index: number }>(async (resolve, reject) => {
      try {
        const agent = Actor.agentOf(DataBoxActor)
        const canisterID = Actor.canisterIdOf(DataBoxActor)
        if (!agent) return reject("agent error")
        const path = [new TextEncoder().encode('request_status'), requestId]
        const currentRequest = await agent.createReadStateRequest?.({paths: [path]})
        const state = await agent.readState(canisterID, {paths: [path]}, undefined, currentRequest)
        if (agent.rootKey == null) return reject('Agent root key not initialized before polling')
        const cert = await Certificate.create({
          certificate: state.certificate,
          rootKey: agent.rootKey,
          canisterId: canisterID,
        });
        const maybeBuf = cert.lookup([...path, new TextEncoder().encode('status')])
        let status: read_state;
        if (typeof maybeBuf === 'undefined') {
          status = RequestStatusResponseStatus.Unknown;
        } else {
          status = new TextDecoder().decode(maybeBuf) as read_state;
        }
        if (status === "replied") {
          const result = cert.lookup([...path, 'reply'])!;
          const putFunc = await getFunc(idlFactory, "put")
          const decodedResult = await decodeReturnValue(putFunc.func.retTypes, result) as unknown as Result_2
          if ("err" in decodedResult) return reject(Object.keys(decodedResult.err)[0])
        }
        if (status === "rejected") {
          const rejectCode = new Uint8Array(cert.lookup([...path, 'reject_code'])!)[0];
          const rejectMessage = new TextDecoder().decode(cert.lookup([...path, 'reject_message'])!);
          return reject(
            ` Call was rejected:\n` +
            `  Request ID: ${toHex(requestId)}\n` +
            `  Reject code: ${rejectCode}\n` +
            `  Reject text: ${rejectMessage}\n`,
          );
        }
        return resolve({data: status, index})
      } catch (e) {
        reject(e)
      }
    })
  }
}

const check_by_read_state = async (all_request_id: RequestId[], DataBoxActor: Actor) => {
  return new Promise<read_state[]>(async (resolve, reject) => {
    try {
      const all_read_state_promise = new Array<() => Promise<{ data: read_state, index: number }>>()
      for (let i = 0; i < all_request_id.length; i++) {
        const requestId = all_request_id[i]
        if (i !== 0 && i % 30 === 0) await sleep(2000)
        all_read_state_promise.push(read_state(requestId, i, DataBoxActor))
      }
      const res = await retry<read_state>(all_read_state_promise, 3)
      const state_arr: read_state[] = []
      res.forEach(e => state_arr.push(e.data))
      return resolve(state_arr)
    } catch (e) {
      reject(e)
    }
  })
}


const get_new_args = (args: ArrayBuffer[], read_state_res_arr: read_state[]) => {
  const new_args: ArrayBuffer[] = []
  read_state_res_arr.forEach((read_state_res, index) => {
    console.log("read state", read_state_res)
    if (read_state_res !== "replied") {
      new_args.push(args[index])
    }
  })
  return {new_args}
}

const check = async (all_keys: string[], dataBox: Box): Promise<boolean> => {
  for (let i = 0; i < all_keys.length; i++) {
    const key = all_keys[i]
    try {
      await dataBox.getFileInfo(key)
    } catch (e: any) {
      if (e.message === "FileKeyErr") return false
      throw e
    }
  }
  return true
}

export const uploadEncryptedFile = async (file: File | Blob, publicKey: string, props: Props) => {
  const {key, isPrivate, Actor, dataBox} = props
  const total_size = file.size
  const allData = await FileRead(file)
  const data = new Uint8Array(total_size)
  for (let i = 0; i < allData.length; i++) {
    data.set(allData[i], i * chunkSize)
  }
  const {encData, encryptedAesKey} = await encryptFileData(data, publicKey)
  const NewBlob = new Blob([encData])
  const encryptedData = await FileRead(NewBlob)
  const one_file_args: ArrayBuffer[] = []
  const putFunc = await getFunc(idlFactory, "put")
  for (let i = 0; i < encryptedData.length; i++) {
    const arg: FilePut = {
      EncryptFilePut: {
        IC: {
          file_extension: file.type,
          order: BigInt(i),
          chunk_number: BigInt(Math.ceil(NewBlob.size / chunkSize)),
          chunk: {data: encryptedData[i]},
          aes_pub_key: [encryptedAesKey],
          file_name: file.name ?? "",
          file_key: key,
          total_size: BigInt(NewBlob.size),
          is_private: isPrivate
        }
      }
    }
    const arg_encoded = IDL.encode(putFunc.func.argTypes, [arg])
    one_file_args.push(arg_encoded)
  }
  return await put_on_file(true, putFunc.methodName, one_file_args, key, Actor, dataBox)
}

export const uploadEncryptedArrayBuffer = async (data: Uint8Array, publicKey: string, props: Props) => {
  const blob = new Blob([data], {type: "uint8array"})
  await uploadEncryptedFile(blob, publicKey, props)
}

export const uploadEncryptedText = async (text: string, publicKey: string, props: Props) => {
  const data = new TextEncoder().encode(text);
  const blob = new Blob([data], {type: "text/plain"})
  await uploadEncryptedFile(blob, publicKey, props)
}

export const uploadPlainFile = async (file: File | Blob, props: Props): Promise<boolean> => {
  try {
    const {key, isPrivate, Actor, dataBox} = props
    const total_size = file.size
    const total_index = Math.ceil(total_size / chunkSize)
    const allData = await FileRead(file)
    const putFunc = await getFunc(idlFactory, "put")
    const one_file_args: ArrayBuffer[] = []
    for (let i = 0; i < allData.length; i++) {
      const arg: FilePut = {
        PlainFilePut: {
          IC: {
            file_extension: file.type,
            order: BigInt(i),
            chunk_number: BigInt(total_index),
            chunk: {data: allData[i]},
            aes_pub_key: [],
            file_name: file.name ?? "",
            file_key: key,
            total_size: BigInt(file.size),
            is_private: isPrivate
          }
        }
      }
      const arg_encoded = IDL.encode(putFunc.func.argTypes, [arg])
      one_file_args.push(arg_encoded)
    }
    return await put_on_file(false, putFunc.methodName, one_file_args, key, Actor, dataBox)
  } catch (e) {
    throw e
  }
}

export const uploadPlainArrayBuffer = async (data: Uint8Array, props: Props) => {
  const blob = new Blob([data], {type: "uint8array"})
  await uploadPlainFile(blob, props)
}

export const uploadPlainText = async (text: string, props: Props) => {
  const data = new TextEncoder().encode(text);
  const blob = new Blob([data], {type: "text/plain"})
  await uploadPlainFile(blob, props)
}

const ONE_BYTE_UPLOAD_USE_CYCLES = 2260
const ONE_INGRESS_MESSAGE_COST = 1200000
export const ONE_GB_STORE_THRESHOLD_COST = 127000 * 40 * 24 * 60 * 60

const checkState = (chunkNumber: number, dataBox: Box): Promise<boolean> => {
  return new Promise<boolean>(async (resolve, reject) => {
    try {
      const res = await dataBox.boxState()
      const totalSize = chunkNumber * chunkSize
      const memory: number = Number(res.memory_size) + Number(res.stable_memory_size)
      const balance: number = Number(res.balance)
      const finalSize: number = memory + totalSize // 之前的大小加上这次的大小
      if (finalSize > memory_threshold) return reject("Not enough storage")
      const GbNumber = (finalSize / (1024 * 1024 * 1024)).toFixed(4); // 多少 GB
      const storeThresholdCost: number = Number(GbNumber) * ONE_GB_STORE_THRESHOLD_COST // 加上此次存储大小之后存储40天花费
      const totalStorageCost: number = totalSize * ONE_BYTE_UPLOAD_USE_CYCLES //存进去花费
      const totalIngressCost: number = chunkNumber * ONE_INGRESS_MESSAGE_COST //ingress message花费

      const totalCost: number = totalStorageCost + totalIngressCost + storeThresholdCost
      if (totalCost < balance) return resolve(true)
      else return reject(Number(totalCost - balance))
    } catch (e) {
      reject(e)
    }
  })
}



