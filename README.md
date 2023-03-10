# YCD WebRTC SDK

## Usage

1. 安装 socket.io-client、ycd-webrtc-sdk 包

```bash
npm install socket.io-client -S // sdk依赖此包
npm install ycd-webrtc-sdk -S
```

2. Example

```js
import { WebRTCClient } from "ycd-webrtc-sdk";

const client = new WebRTCClient({
  roomID: string, // roomID
  server: string, // signal server 地址
  remoteElement: element, // 接收远端数据的Element  Audio/Video
  localElement: element, // 本地数据的Element  Audio/Video  可选
  events: {
    // 事件列表
    onJoined: () => {}, // 成功进入房间后回调
    onLeft: () => {}, // 成功离开房间回调
    onCustomerJoined: () => {}, // 客户(其他人)加入房间回调
    onFull: () => {}, // 房间满员回调
    onBye: () => {}, // 已关闭所有连接
  },
});

// 离开房间
client.leave(); // 离开房间，开始断开流传输等操作
```

## License

MIT
