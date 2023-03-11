## MetaBox js sdk

MetaBox 多链版本SDK

## Get Start

### Install

`npm install js-metabox`

### Usage

```js
import {MetaBox, Box} from "js-metabox";
import {HttpAgent} from "@dfinity/agent";

(async () => {

  /**
   * ic 的身份
   */
  const agent = new HttpAgent({
    identity: Identity,
    host: "https://ic0.app"
  });
  /**
   * 创建MetaBox实例
   */
  const MBApi = new MetaBox(agent)
  /**
   *   在MetaBox中的account ID
   *   如果你想用 ICP 创建 Box 的话需要向这个地址打入足够的ICP
   *  目前只支持用 icp 创建 Box
   */
  const accountId = await MBApi.getICAccountID()

  /**
   * 获取创建 Box 需要的费用
   *
   */
  const amount = await MBApi.getRequiredToken("icp")

  /**
   * 可以通过多种代币 创建 Box
   * 目前支持只 icp
   */
  const boxId = await MBApi.createBox({
    'is_private': true,
    'box_name': "test"
  })

  /**
   * 获取用户所有的Box
   *
   */
  const boxes = await MBApi.getAllBoxes({ICP: UserID})

  /**
   * 升级Box
   *
   */
  const upgradeRes = await MBApi.upgradeBox({
    'canister_id': boxId,
    'is_private': true,
    'box_name': "test",
  })

  /**
   * 获取Box 最新版本
   *
   */
  const lastestVersion = Number(await MBApi.getBoxLatestVersion())


  /**
   * 创建Box实例
   *
   */
  const boxApi = new Box(boxId.toString(), agent)

  /**
   * 上传明文数据
   *
   */
  const fileKey = await boxApi.uploadPlaintextFile({
    data: "hello world",
    isPrivate: true,
    chain: "icp", // 目前只支持 icp
    fileKey: "xxx",//可指定该数据file Key
  })

  /**
   * 获取明文数据
   * @argument {string} file Key
   */
  const data = await boxApi.getPlaintextFile("xxx")

  /**
   * 删除明文数据
   *
   */
  const deleteRes = await boxApi.deletePlaintextFile("xxx")

  /**
   *
   * 获取指定file的信息
   *
   * @param {string} fileKey
   * @return {Result_2}
   */
  const fileInfo = await boxApi.getFileInfo("xxx")

  /**
   * 获取 Box 版本
   *
   */
  const version = Number(await boxApi.getBoxVersion())


  /**
   * 获取 Box 中所有文件的信息
   *
   */
  const allInfo = await boxApi.getAllFileInfo()

  /**
   *
   * 分享明文且private的文件
   *
   * @param shareFileArg
   */
  const shareRes = await boxApi.sharePrivatePlaintextFile({
    file_key: "xxx",
    to: Principal.from("xxxx")
  })

  /**
   * 取消分享
   *
   */
  const cancleShareRes = await boxApi.cancelSharePrivatePlaintextFile({
    file_key: "xxx",
    to: Principal.from("xxxx")
  })

  /**
   * 文件过多的时候，可以分批获取文件的信息
   *
   */
  const fileCount = await boxApi.getFileCount({'Plain': null})

  /**
   * 分页get数据
   *
   * @param {FileLocation} fileLocation 文件位置
   * @param {number} onePageFileCount 每一页的数据大小 不能超过5000
   * @param {number} pageIndex 取哪一页
   * @example
   * getFilesOfPage({Plain:null},2,0) 取明文数据，每一页有两个数据，取第一页
   */
  const filesInfo = await boxApi.getFilesOfPage({Plain: null}, 2, 0)

})()
```

```js
/**
 * 监视Box状态函数
 *
 *
 */
import {Box, isSecurityThresholdReached} from "js-metabox";

const BoxApi = new Box(cid, agent)
try {
  await isSecurityThresholdReached(BoxApi)
} catch (e) {
  if (e.message === "Insufficient memory available in this box") {  //表示此box内存不足
    //....建议更换Box存储
  } else if (e.message === "The Box has hit its safe cycle limit") {//表示Box cycles不足以维持他静态存储40天
    const needCycle = e.data //至少需要充值 ${needCycle} 才能维持40天静态存储
  } else throw e
}

```

