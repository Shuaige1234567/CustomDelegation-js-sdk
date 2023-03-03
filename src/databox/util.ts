import {FilePut} from "./did/databox_type";
import {ActorMethod, ActorSubclass} from "@dfinity/agent";
import {chunkSize, DataBox} from "./databox";


type Props = {
  key: string,
  isPrivate: boolean,
  Actor: ActorSubclass<Record<string, ActorMethod<unknown[], unknown>>>,
  allPromise: Array<Promise<any>>
}

export const uploadEncryptedFile = async (file: File | Blob, publicKey: string, props: Props) => {
  const {key, isPrivate, allPromise, Actor} = props
  const total_size = file.size
  const allData = await DataBox.FileRead(file)
  const data = new Uint8Array(total_size)
  for (let i = 0; i < allData.length; i++) {
    data.set(allData[i], i * chunkSize)
  }
  const {encData, encryptedAesKey} = await DataBox.encryptFileData(data, publicKey)
  const NewBlob = new Blob([encData])
  const encryptedData = await DataBox.FileRead(NewBlob)
  for (let i = 0; i < encryptedData.length; i++) {
    const arg: FilePut = {
      EncryptFilePut: {
        IC: {
          file_extension: file.type,
          order: BigInt(i),
          chunk_number: BigInt(Math.ceil(NewBlob.size / chunkSize)),
          chunk: {data: encryptedData[i]},
          aes_pub_key: [encryptedAesKey],
          file_name: file.name,
          file_key: key,
          total_size: BigInt(NewBlob.size),
          is_private: isPrivate
        }
      }
    }
    allPromise.push(Actor.put(arg))
  }
}

export const uploadEncryptedArrayBuffer = async (data: Uint8Array, publicKey: string, props: Props) => {
  const blob = new Blob([data], {type: "Uint8Array"})
  await uploadEncryptedFile(blob, publicKey, props)
}

export const uploadEncryptedText = async (text: string, publicKey: string, props: Props) => {
  const data = new TextEncoder().encode(text);
  const blob = new Blob([data], {type: "text/plain"})
  await uploadEncryptedFile(blob, publicKey, props)
}

export const uploadPlainFile = async (file: File | Blob, props: Props) => {
  const {key, isPrivate, allPromise, Actor} = props
  const total_size = file.size
  const total_index = Math.ceil(total_size / chunkSize)
  const allData = await DataBox.FileRead(file)
  for (let i = 0; i < allData.length; i++) {
    const arg: FilePut = {
      PlainFilePut: {
        IC: {
          file_extension: file.type,
          order: BigInt(i),
          chunk_number: BigInt(total_index),
          chunk: {data: allData[i]},
          aes_pub_key: [],
          file_name: file.name ? file.name : "",
          file_key: key,
          total_size: BigInt(file.size),
          is_private: isPrivate
        }
      }
    }
    allPromise.push(Actor.put(arg))
  }
}

export const uploadPlainArrayBuffer = async (data: Uint8Array, props: Props) => {
  const blob = new Blob([data], {type: "Uint8Array"})
  await uploadPlainFile(blob, props)
}

export const uploadPlainText = async (text: string, props: Props) => {
  const data = new TextEncoder().encode(text);
  const blob = new Blob([data], {type: "text/plain"})
  await uploadPlainFile(blob, props)
}
