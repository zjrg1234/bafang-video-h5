<template>
  <div class="video-player-container" v-loading="updateLoading">
    <div class="video-item">
      <!-- 视频容器 -->
      <div class="video-wrapper">
        <video poster="../assets/video.png" ref="videoRef" id="video-player" class="video-element" autoplay playsinline
          muted controlsList="nodownload" :style="{ objectFit: fitMode }" @canplay="videoCanplay"></video>

        <audio ref="audioRef" id="audio-player" autoplay class="audio-element"></audio>
        <!-- WiFi 图标 -->
        <div v-show="showWifiIcon" class="wifi-icon-wrap" ref="wifiIconRef" @click="openWifiConfig">
          <i class="fa fa-wifi"></i>
        </div>

        <div class="video-res" ref="videoResRef">

          <span v-for="(item, index) in qualityList" :key="index" class="btn-quality"
            :class="{ active: currentQuality === item.value }" @click="handleSelect(item.value)">
            {{ item.label }}
          </span>
        </div>
        <!-- <div class="icon-wrap mic-wrap" v-show="isMicOpen" ref="micRef" @click="handleMic">
          <img class="icon-image" src="../assets/microphone_open@2x.png" alt="" srcset="">
        </div>

        <div class="icon-wrap mic-wrap" v-show="!isMicOpen" ref="micRef" @click="handleMic">
          <img class="icon-image" src="../assets/microphone_close@2x.png" alt="" srcset="">
        </div> -->

        <div class="icon-wrap mic-wrap" v-show="isMicOpen" @pointerdown="onPointerDown" @pointerup="onPointerUp"
          @pointercancel="onPointerCancel" @pointerleave="onPointerCancel" @contextmenu.prevent>
          <img class="icon-image" src="../assets/microphone_open@2x.png" alt="" />
          <div v-show="rippleActive" class="ripple"></div>
        </div>

        <div class="icon-wrap mic-wrap" v-show="!isMicOpen" @pointerdown="onPointerDown" @pointerup="onPointerUp"
          @pointercancel="onPointerCancel" @pointerleave="onPointerCancel" @contextmenu.prevent>
          <img class="icon-image" src="../assets/microphone_close@2x.png" alt="" />
          <div v-show="rippleActive" class="ripple"></div>
        </div>


        <!-- WiFi 图标 -->
        <div class="icon-wrap sound-wrap" v-show="isSoundOpen" ref="soundRef" @click="handleSound">
          <img class="icon-image" src="../assets/sound_open@2x.png" alt="" srcset="">
        </div>

        <div class="icon-wrap sound-wrap" v-show="!isSoundOpen" ref="soundRef" @click="handleSound">
          <img class="icon-image" src="../assets/sound_close@2x.png" alt="" srcset="">
        </div>
      </div>

      <!-- 视频信息展示 -->
      <!-- <div class="video-info" ref="videoInfoRef">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">码率:</span>
            <span class="info-value">{{ videoInfo.bitrate || '0.0' }} KB/s</span>
          </div>
          <div class="info-item">
            <span class="info-label">分辨率:</span>
            <span class="info-value">{{ videoInfo.resolution || '未知' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">编码格式:</span>
            <span class="info-value">{{ videoInfo.codec || '未知' }}</span>
          </div>
        </div>
      </div> -->

    </div>
    <!-- wifi配置列表 -->
    <wifi v-if="showWifiConfig" :wifiList="wifiList" :isWifiLoading="isWifiLoading" :conectingLoading="conectingLoading"
      @onWiFiConnect="handleWiFiConnect" @startUpdateWifiList="handleUpdateWifiList"
      @clearUpdateTimer="clearUpdateTimer" @close="showWifiConfig = false"></wifi>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted, onMounted } from 'vue';
import InitWebSocket from '../utils/ws';
import PeerConnection from '../utils/p2p';
import { getUrlParam } from '../utils/func';
import wifi from '../components/wifi.vue';
import { ElMessage } from 'element-plus';
import { checkDeviceUpdate } from '../api/index.js';
// ------------------- 全局变量 & 配置 -------------------
let peer_id = ''; // 本地 Peer ID
let remote_peer_id = '';
let token = '';
let initAction = null;
const isSoundOpen = ref(false)
const isMicOpen = ref(false)

const qualityListMap = [
  { label: "超清", value: "2" },
  { label: "高清", value: "3" },
  { label: "标清", value: "4" },
];
const qualityList = ref([]);
const currentQuality = ref('')
//有效值
const initActionValidList = ["video_only", "video_audio"];
let socket = null;
let connectedWifi = ref(-1);
let socketUsable = ref(false);

let openAudioResolver = null;


let longPressTimer = null;
let isLongPress = false;

const onPointerDown = (e) => {
  isLongPress = false;

  longPressTimer = setTimeout(() => {
    isLongPress = true;
    if (!isMicOpen.value) return;
    rippleActive.value = true;
  }, 500); // 长按阈值 500ms
};

const onPointerUp = (e) => {
  // 清除定时器
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (isLongPress) {
    // 长按结束，隐藏波纹
    rippleActive.value = false;
    isLongPress = false;
    isMicOpen.value = false;
    closeMic();
    return;
  }

  // 单击：先执行业务，再显示波纹闪现
  handleMic();

  rippleActive.value = true;
  setTimeout(() => {
    rippleActive.value = false;
  }, 300); // 闪现 300ms
};

const onPointerCancel = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  rippleActive.value = false;
  isLongPress = false;
};

//生成随机peer_id
var getClientId = (n) => {
  var t = "";
  const chars = "0123456789";
  const maxPos = chars.length;
  for (var i = 0; i < n; i++) {
    t += chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return t;
};

let isProcessing = false; // 是否正在处理信令
let signalQueue = []; // 缓存等待处理的信令
let peerconn = null;
function nativeReport(code, reportContent) {
  if (window.AndroidBridge && typeof window.AndroidBridge.callNativeReport === 'function') {
    try {
      window.AndroidBridge.callNativeReport(code, reportContent);
    } catch (e) {
    }
  }
  // 2. 发给 iOS
  else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.callNativeReport) {
    window.webkit.messageHandlers.callNativeReport.postMessage({
      code: code,
      reportContent: reportContent
    });
  }

  else {
    // 非原生环境（比如浏览器调试）的降级处理
  }
  // 3. 统一触发事件：三端外部项目都只监听这个事件即可！
  const event = new CustomEvent('nativeReport', { detail: { code, reportContent } });
  window.dispatchEvent(event);
  window.parent.postMessage({
    type: "nativeReport",
    detail: { code, reportContent }
  }, "*");
}
const callback = (type, message) => {
  switch (type) {
    case "add_video": {
      if (videoRef.value) {
        videoRef.value.srcObject = message.stream;
        const playPromise = videoRef.value.play();

        if (playPromise !== undefined) {
          playPromise.then(() => {
          }).catch((error) => {
          });
        }
      }
      break;
    }
    case "add_audio": {
      // 重置状态
      audioRef.value.muted = false;
      audioRef.value.volume = 1;
      audioRef.value.srcObject = null;

      // 绑定正确的音频流
      audioRef.value.srcObject = message.stream;
      // 触发播放 + 验证轨道
      audioRef.value.play().then(() => {
        // 验证轨道（此时应该能看到轨道数=1）
        // const tracks = audioRef.value.srcObject?.getAudioTracks() || [];
        //此处为了解决调用音频接口时，快速调用麦克风关闭操作无效的问题(因为显示调用成功时，音频建立需要一定时间)
        isAudioPlay.value = true;
        const result = { method: 'handleOpenAudio', state: '调用成功(打开音频)', ret: true };
        report910Callback(result);
        openAudioResolver?.resolve(result);
        openAudioResolver = null;
      }).catch(error => {
        const result = { method: 'handleOpenAudio', state: '调用失败(打开音频)', ret: false }
        report910Callback(result);
        openAudioResolver?.reject(result);
        openAudioResolver = null;
      });
      break;
    }
    case "audio_stop": {
      isAudioPlay.value = false;
      break;
    }
    // 监听 codec 信息
    case "video_codec":
      // console.log(` codec:`, message.codec);
      videoInfo.codec = message.codec;
      break;
    // 监听分辨率信息
    case "video_resolution":
      // console.log(`分辨率:`, message.resolution);
      videoInfo.resolution = message.resolution;
      break;
    // 监听码率信息
    case "video_bitrate":
      // console.log(`码率:`, message.bitrate + ' KB/s');
      videoInfo.bitrate = message.bitrate;
      break;
    // 监听连接状态
    case "datachannel_message":
      console.log(`数据通道消息:`, message);
      nativeReport(907, JSON.stringify(message));
      break;
    case "connection_state":
      console.log(`连接状态:`, message.state);
      nativeReport(909, `${message.state}`)
      break;
  }
};

function processSignalQueue() {
  // 队列为空则结束
  if (signalQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  // 取出第一条信令
  const currentJson = signalQueue.shift();

  // 4. 处理当前信令（复用你的原有逻辑）
  if (peerconn === null) {
    peerconn = new PeerConnection(callback, peer_id, socket);
  }
  // 5. 关键：通过监听 PeerConnection 内部状态变化，判断处理完成
  // （利用现有事件或状态，无需修改 PeerConnection 源码）
  const waitForComplete = () => {
    return new Promise(resolve => {
      // 轮询检查连接状态（根据实际场景调整判断条件）
      const checkInterval = setInterval(() => {
        // 例如：当 connection 不为空，且信令相关异步操作可能已完成
        if (peerconn?.connection) {
          // 对于 160 信令：可检查 local_stream 是否存在
          if (currentJson.sub_type === 160) {
            clearInterval(checkInterval);
            resolve();
          }
          // 对于 150 信令：可检查 localDescription 是否设置
          else if (currentJson.sub_type === 150 && peerconn.connection.localDescription) {
            clearInterval(checkInterval);
            resolve();
          }
          // 对于 103 信令：简短延迟后认为完成（ICE候选者添加较快）
          else if (currentJson.sub_type === 103) {
            clearInterval(checkInterval);
            resolve(); // 直接 resolve，或加个短延迟
          }
          // 其他信令类似：找到一个能标识“处理完成”的状态
          else if ([151, 161].includes(currentJson.sub_type)) {
            clearInterval(checkInterval);
            resolve(); // 根据实际逻辑调整判断条件
          }
          // 新增：170 信令（数据通道）
          else if (currentJson.sub_type === 170) {
            // 检查条件：
            // 1. DataChannel 实例已创建
            // 2. 通道状态为 "open"（已成功打开）
            const dataChannel = peerconn.dataChannel; // 假设数据通道存在该属性中
            if (dataChannel && dataChannel.readyState === 'open') {
              clearInterval(checkInterval);
              resolve();
            }
          }
        }
      }, 100); // 每100ms检查一次
    });
  };
  // 执行原有处理函数，并等待其完成
  peerconn?.createPeer(currentJson);
  waitForComplete().then(() => {
    // 当前信令处理完成，继续下一条
    processSignalQueue();
  });
}

const handleMessage = async (json) => {
  //处理ws消息
  if (json.event != 'ping') {
    //  console.log("【"+json.peer_id+"】消息", json);
  }
  if (json.type === 100) {
    switch (json.sub_type) {
      case 150:
      case 151:
      case 160:
      case 161:
      case 170:
      case 103: {
        // 把信令加入队列
        signalQueue.push(json);
        // 如果当前没有在处理，启动处理流程
        if (!isProcessing) {
          processSignalQueue();
        }
        break;
      }
      default:
        break;
    }
  }
  if (json.type === 900 && json.sub_type === 908) {
    //设备主机断开或未连接
    nativeReport(json.sub_type, json.data.message)
    isVideoPlay.value = false;
    isAudioPlay.value = false;
  }
  if (json.sub_type === 305) {
    nativeReport(json.sub_type, JSON.stringify(json.data))
    deviceType.value = json.data.type_name
    versionTag.value = json.data.version
  }
  if (json.sub_type === 309) {
    if (json.ret === '2') {
      updateLoading.value = true;
      report910Callback({ method: 'updateVersion', state: '设备固件下载中', ret: true });
    } else if (json.ret === '1') {
      updateLoading.value = false;
      rebootDevice();
      report910Callback({ method: 'updateVersion', state: '设备固件下载完成,已重启设备以更新固件', ret: true });
    } else if (json.ret === '0') {
      report910Callback({ method: 'updateVersion', state: '设备固件下载失败', ret: false });
      updateLoading.value = false;
    }
  }
  if (json.sub_type === 302) {
    // 1. data 为空的情况
    if (json.data === null) {
      isWifiLoading.value = false;
      if (!updateWifiTimer) wifiList.value = [];
      nativeReport(json.sub_type, JSON.stringify(wifiList.value))
      if (wifiParams.value) {
        setWifiCallback({ wifiName: wifiParams.value.name, state: '设备连接WiFi失败', ret: false });
        conectingLoading.value = false;
        ElMessage.error("连接失败");
        wifiParams.value = null;
      }
      return;
    }

    // 2. data 正常，开始处理
    const rawList = json.data;
    isWifiLoading.value = false;

    // 分离已连接 + 未连接（按信号排序）
    const connected = rawList.find(item => item.connected === 1);
    const unconnected = rawList
      .filter(item => item.connected !== 1)
      .sort((a, b) => b.rssi - a.rssi);

    // 最终列表：已连接置顶
    wifiList.value = connected ? [connected, ...unconnected] : unconnected;
    nativeReport(json.sub_type, JSON.stringify(wifiList.value))
    // 已连接索引永远是 0（因为置顶了）
    connectedWifi.value = connected ? 0 : -1;

    // 3. 处理连接结果提示
    if (wifiParams.value) {
      const targetName = wifiParams.value.name;
      const isSuccess = !!connected && connected.name === targetName;

      if (isSuccess) {
        ElMessage.success(`已连接到 ${targetName}`);
        setWifiCallback({ wifiName: wifiParams.value.name, state: '设备连接WiFi成功', ret: true });
      } else {
        setWifiCallback({ wifiName: wifiParams.value.name, state: '设备连接WiFi失败', ret: false });
        ElMessage.error("连接失败");
      }

      // 重置状态
      wifiParams.value = null;
      conectingLoading.value = false;
    }
  }
  if (json.event === 'socket_open') {
    socketUsable.value = true;
    setInitCallback({ state: '初始化成功', ret: true });
    const res = await checkWebrtcUsable();
    nativeReport(909, `${res.msg}`)
    console.log(res);
    if (initAction && initAction.includes('video')) {
      handleOpenVideo()
    }
  }
  if (json.event === 'socket_close' || json.event === 'socket_error') {
    socketUsable.value = false;
    setInitCallback({ state: '初始化失败', ret: false });
  }
}

// ------------------- 响应式状态 -------------------
const videoRef = ref(null); // 视频 DOM 引用
const fitMode = ref('fill')
const videoInfoRef = ref(null); // 视频信息 DOM 引用
const audioRef = ref(null); // 音频 DOM 引用
const videoInfo = reactive({
  bitrate: '0.0',
  resolution: '未知',
  codec: '未知'
});

const isAudioPlay = ref(false); // 音频是否开启
const isVideoPlay = ref(false); // 视频是否播放
const deviceType = ref('') // 设备类型
const versionTag = ref('') // 设备版本号
const onlineVersion = ref('') // 在线版本号
const updateLoading = ref(false); // 更新固件loading


// ------------------- 页面操作函数 -------------------

// 关闭 P2P 连接
const closeP2P = () => {
  console.log('关闭P2P连接', peerconn);
  if (peerconn) {
    peerconn.close();
  };
  peerconn = null;
  setTimeout(() => {
    videoInfo.bitrate = '0.0';
  }, 5000);
  videoInfo.resolution = '未知';
  videoInfo.codec = '未知';
  isVideoPlay.value = false;
  if (videoRef.value) videoRef.value.srcObject = null;
  if (audioRef.value) audioRef.value.srcObject = null;
};
//接口调用结果回调
const report910Callback = (state) => {
  nativeReport(910, JSON.stringify(state))
}
//wifi设置结果回调
const setWifiCallback = (state) => {
  nativeReport(911, JSON.stringify(state))
}
//初始化结果回调
const setInitCallback = (state) => {
  nativeReport(912, JSON.stringify(state))
}
// 静态检测不变
const isWebrtcApiSupported = () => {
  const hostname = location.hostname;
  const isSecure = window.isSecureContext || hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isSecure) return false;

  const hasMediaApi = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    || navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  const hasPeerConn = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  const hasRTCDesc = window.RTCSessionDescription || window.webkitRTCSessionDescription;
  const hasIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate;

  return !!(hasMediaApi && hasPeerConn && hasRTCDesc && hasIceCandidate);
}

// 仅检测API环境，不校验摄像头麦克风权限/硬件
const checkWebrtcUsable = async () => {
  if (!isWebrtcApiSupported()) {
    return { ok: false, msg: 'webrtc_no_support' };
  }
  // 无需拉取媒体流，直接判定可用
  return { ok: true, msg: 'webrtc_usable' };
}

const handleOpenVideo = () => {
  //remote_peer_id只能为数字格式
  if (!/^\d+$/.test(remote_peer_id)) {
    report910Callback({ method: 'handleOpenVideo', state: '调用失败(设备ID参数错误)', ret: false });
    return
  }
  if (!socketUsable.value) {
    report910Callback({ method: 'handleOpenVideo', state: '调用失败(未连接服务)', ret: false });
    return;
  }
  if (!videoRef.value) return;
  if (isVideoPlay.value) {
    report910Callback({ method: 'handleOpenVideo', state: '当前视频处于开启状态，无需重复开启', ret: false });
    return;
  }
  let peerJson = {
    type: 100,
    sub_type: 150,
    remote_peer_id: +remote_peer_id,
    data: { device_id: null, stream_type: 'sub', sdp: '' },
    peer_id: peer_id
  };
  socket.send(peerJson);
  setTimeout(() => {
    peerJson = {
      type: 300,
      sub_type: 305,
      remote_peer_id: +remote_peer_id,
      peer_id: peer_id
    }
    socket.send(peerJson);
  }, 500);

  const timer = setTimeout(() => {
    if (openAudioResolver) {
      const err = { method: 'handleOpenAudio', state: '调用超时(设备无响应)', ret: false };
      report910Callback(err);
      openAudioResolver.reject(err);
      openAudioResolver = null;
    }
    clearTimeout(timer);
  }, 10000); // 10秒超时
}
const handleCloseVideo = () => {
  if (!socketUsable.value) {
    report910Callback({ method: 'handleCloseVideo', state: '调用失败(未连接服务)', ret: false });
    return;
  }
  if (!videoRef.value) return;
  if (isAudioPlay.value && isVideoPlay.value) {
    //视频和音频同时开着的时候，先关闭音频再关闭视频
    let peerJson = {
      type: 100,
      sub_type: 161,
      remote_peer_id: +remote_peer_id,
      data: { sdp: '' },
      peer_id: peer_id
    };
    socket.send(peerJson);
    //当isAudioPlay变为false,再关闭视频
    let checkAudioStop = setInterval(() => {
      if (!isAudioPlay.value) {
        clearInterval(checkAudioStop);
        let peerJson = {
          type: 100,
          sub_type: 152,
          remote_peer_id: +remote_peer_id,
          peer_id: peer_id
        };
        socket.send(peerJson);
        closeP2P()
        report910Callback({ method: 'handleCloseVideo', state: '调用成功(关闭视频)', ret: true });
      }
    }, 1000);
  } else {
    let peerJson = {
      type: 100,
      sub_type: 152,
      remote_peer_id: +remote_peer_id,
      peer_id: peer_id
    };
    socket.send(peerJson);
    closeP2P()
    report910Callback({ method: 'handleCloseVideo', state: '调用成功(关闭视频)', ret: true });
  }
}

// 切换音频静音状态
// 新增：存储当前音频打开的 Promise resolve/reject


const handleOpenAudio = () => {
  return new Promise((resolve, reject) => {
    if (!socketUsable.value) {
      const err = { method: 'handleOpenAudio', state: '调用失败(未连接服务)', ret: false };
      report910Callback(err);
      return reject(err);
    }
    if (!audioRef.value || isAudioPlay.value) {
      const err = { method: 'handleOpenAudio', state: '当前音频处于开启状态，无需重复开启', ret: false };
      report910Callback(err);
      return reject(err);
    }
    if (!isVideoPlay.value) {
      const err = { method: 'handleOpenAudio', state: '请先开启视频，再调用此接口开启音频', ret: false };
      report910Callback(err);
      return reject(err);
    }

    // 保存 resolver，供 callback 中调用
    openAudioResolver = { resolve, reject };

    const peerJson = {
      type: 100,
      sub_type: 160,
      remote_peer_id: +remote_peer_id,
      data: { sdp: '' },
      peer_id: peer_id
    };
    socket.send(peerJson);
  });
};

const handleCloseAudio = () => {
  if (!audioRef.value || !isAudioPlay.value) {
    report910Callback({ method: 'handleCloseAudio', state: '当前音频未开启，无需关闭', ret: false });
    return;
  };
  console.log('关闭音频', peerconn);
  audioRef.value.muted = isAudioPlay.value;
  let peerJson = {
    type: 100,
    sub_type: 161,
    remote_peer_id: +remote_peer_id,
    data: { sdp: '' },
    peer_id: peer_id
  };

  socket.send(peerJson);
  report910Callback({ method: 'handleCloseAudio', state: '调用成功(关闭音频)', ret: true });
};
const handleChangeRes = (res) => {
  if (!socketUsable.value) {
    report910Callback({ method: 'handleChangeRes', state: '调用失败(未连接服务)', ret: false });
    return;
  }
  if (!videoRef.value) return;
  let peerJson = {
    type: 300,
    sub_type: 303,
    remote_peer_id: +remote_peer_id,
    data: { resolution: res },
    peer_id: peer_id
  };
  socket.send(peerJson);
  report910Callback({ method: 'handleChangeRes', state: '调用成功(切换视频分辨率)', ret: true });
}
// 打开扬声器
const openSpeaker = () => {
  if (!audioRef.value || !isAudioPlay.value) {
    report910Callback({ method: 'openSpeaker', state: '当前音频未开启，调用无效', ret: false });
    return;
  };
  audioRef.value.muted = false;
  report910Callback({ method: 'openSpeaker', state: '调用成功(打开扬声器)', ret: true });
};

// 关闭扬声器
const closeSpeaker = () => {
  if (!audioRef.value || !isAudioPlay.value) {
    report910Callback({ method: 'closeSpeaker', state: '当前音频未开启，调用无效', ret: false });
    return;
  };
  audioRef.value.muted = true;
  report910Callback({ method: 'closeSpeaker', state: '调用成功(关闭扬声器)', ret: true });
};

// 打开麦克风
const openMic = () => {
  console.log("openMic", 1)
  if (!isAudioPlay.value) {
    report910Callback({ method: 'openMic', state: '当前音频未开启，调用无效', ret: false });
    return;
  };
  //若用户这边没有开启麦克风权限
  console.log(peerconn.local_stream)
  if (!peerconn.local_stream) {
    report910Callback({ method: 'openMic', state: '当前麦克风权限未开启，调用失败', ret: false });
    return;
  }

  if (peerconn?.local_stream) {
    const tracks = peerconn.local_stream.getAudioTracks();
    tracks.forEach(track => track.enabled = true);
  }
  report910Callback({ method: 'openMic', state: '调用成功(打开麦克风)', ret: true });
};

// 关闭麦克风
const closeMic = () => {
  console.log(1)
  if (!isAudioPlay.value) {
    report910Callback({ method: 'closeMic', state: '当前音频未开启，调用无效', ret: false });
    return;
  };
  //若用户这边没有开启麦克风权限
  if (!peerconn.local_stream) {
    report910Callback({ method: 'closeMic', state: '当前麦克风权限未开启，调用失败', ret: false });
    return;
  }

  if (peerconn?.local_stream) {
    const tracks = peerconn.local_stream.getAudioTracks();
    tracks.forEach(track => track.enabled = false);
  }
  report910Callback({ method: 'closeMic', state: '调用成功(关闭麦克风)', ret: true });
};
//===========wifi相关===========
const wifiIconRef = ref(null);
const showWifiConfig = ref(false);
const wifiList = ref([]);
const isWifiLoading = ref(false);
const conectingLoading = ref(false);
const wifiParams = ref(null);
let updateWifiTimer = null;
const showWifiIcon = ref(false);
const isShowWifiIcon = () => {
  const setwifi = getUrlParam('setwifi');
  if (setwifi) {
    //展示wifi配置列表
    showWifiIcon.value = true;
  }
}
const openWifiConfig = () => {
  showWifiConfig.value = true;
  isWifiLoading.value = true;
}
const getWifiList = () => {
  socket.send({
    type: 300,
    sub_type: 302,
    peer_id: peer_id,
    remote_peer_id: +remote_peer_id
  })
}
const handleWiFiConnect = (e) => {
  if (!socketUsable.value) {
    report910Callback({ method: 'handleWiFiConnect', state: '调用失败(未连接服务)', ret: false });
    return;
  }
  console.log(e);
  conectingLoading.value = true;
  var data = {
    wifi_name: e.name,
    wifi_password: e.password,
  }
  setWifi(data);
  setTimeout(() => {
    wifiParams.value = e;
  }, 6000);
  report910Callback({ method: 'handleWiFiConnect', state: '调用成功(连接WiFi，等待设备连接)', ret: true });
}

const setWifi = (data) => {
  socket.send({
    type: 300,
    sub_type: 301,
    peer_id: peer_id,
    remote_peer_id: +remote_peer_id,
    data: data
  })
}

const handleUpdateWifiList = (intervalTime) => {
  if (!socketUsable.value) {
    report910Callback({ method: 'handleUpdateWifiList', state: '调用失败(未连接服务)', ret: false });
    return;
  }
  let validInterval = 10000;
  // 判断是否传入有效数字且大于6000毫秒
  if (typeof intervalTime === 'number' && !isNaN(intervalTime) && intervalTime > 6000) {
    validInterval = intervalTime;
  }
  console.log(validInterval);
  clearUpdateTimer();
  getWifiList();
  updateWifiTimer = setInterval(() => {
    getWifiList();
  }, validInterval);
  report910Callback({ method: 'handleUpdateWifiList', state: `调用成功(每${validInterval / 1000}秒循环更新WiFi列表)`, ret: true });
}

const clearUpdateTimer = () => {
  if (updateWifiTimer) {
    clearInterval(updateWifiTimer);
    updateWifiTimer = null;
    console.log('清除循环更新WiFi列表');
  }
}


const clearUpdateWifiList = () => {
  if (updateWifiTimer) {
    clearInterval(updateWifiTimer);
    updateWifiTimer = null;
    report910Callback({ method: 'clearUpdateWifiList', state: '调用成功(清除循环更新WiFi列表)', ret: true });
  } else {
    report910Callback({ method: 'clearUpdateWifiList', state: '调用失败(未开启循环更新WiFi列表)', ret: false });
  }
}

const sendDataChannel = (msg) => {
  console.log('发送数据:', msg);
  if (!peerconn || !peerconn.isDataChannelReady) {
    report910Callback({ method: 'sendDataChannel', state: '调用失败(数据通道未就绪)', ret: false });
    return;
  }
  peerconn.sendData(msg);
  report910Callback({ method: 'sendDataChannel', state: '调用成功(发送数据)', ret: true });
}


const setVideoFitMode = (mode) => {
  const validModes = ['fill', 'contain', 'cover']
  if (!validModes.includes(mode)) {
    console.warn('不支持的object-fit值', mode)
    report910Callback({ method: 'setVideoFitMode', state: '调用失败(参数错误),请传入fill,contain,cover中的一个', ret: false });
    return
  }
  fitMode.value = mode
  report910Callback({ method: 'setVideoFitMode', state: `调用成功(设置视频填充模式为${mode})`, ret: true });
}

//检查版本
const checkVersion = () => {
  if (!deviceType.value || !versionTag.value) {
    report910Callback({ method: 'checkVersion', state: '未获取到设备类型或当前版本', ret: false });
    return;
  }
  checkDeviceUpdate({ type_name: deviceType.value }).then(res => {
    if (res.code !== 200) {
      report910Callback({ method: 'checkVersion', state: '检查版本失败', ret: false });
      return;
    }
    if (res.data.version && res.data.version !== versionTag.value) {
      onlineVersion.value = res.data.version;
      report910Callback({ method: 'checkVersion', state: `有新的版本可以更新，当前版本为${versionTag.value}，最新版本为${res.data.version},是否更新？`, ret: true });
    } else {
      report910Callback({ method: 'checkVersion', state: `当前版本已是最新版本，版本为${versionTag.value}`, ret: true });
    }
  })
}
//更新版本
const updateVersion = () => {
  if (!onlineVersion.value) {
    report910Callback({ method: 'updateVersion', state: '未获取到新版本', ret: false });
    return;
  }
  let peerJson = {
    type: 300,
    sub_type: 309,
    peer_id: peer_id,
    remote_peer_id: +remote_peer_id,
  }
  socket.send(peerJson);
  report910Callback({ method: 'updateVersion', state: '已发送更新指令', ret: true });
}

//重启设备
const rebootDevice = () => {
  let peerJson = {
    type: 300,
    sub_type: 306,
    peer_id: peer_id,
    remote_peer_id: +remote_peer_id,
  }
  socket.send(peerJson);
}

const videoCanplay = () => {
  isVideoPlay.value = true;
  report910Callback({ method: 'handleOpenVideo', state: '调用成功(打开视频)', ret: true });
  if (initAction.includes('audio')) {
    handleOpenAudio();
  }
}


//软件端开发用
window.handleOpenVideo = handleOpenVideo
window.handleCloseVideo = handleCloseVideo
window.handleOpenAudio = handleOpenAudio
window.handleCloseAudio = handleCloseAudio
window.handleChangeRes = handleChangeRes
window.openSpeaker = openSpeaker
window.closeSpeaker = closeSpeaker
window.openMic = openMic
window.closeMic = closeMic
window.handleWiFiConnect = handleWiFiConnect
window.handleUpdateWifiList = handleUpdateWifiList
window.clearUpdateWifiList = clearUpdateWifiList
window.sendDataChannel = sendDataChannel
window.setVideoFitMode = setVideoFitMode
window.checkVersion = checkVersion
window.updateVersion = updateVersion

//web端开发用
window.addEventListener("message", (e) => {
  if (e.data.action === "handleOpenVideo") {
    handleOpenVideo();
  } else if (e.data.action === "handleCloseVideo") {
    handleCloseVideo();
  } else if (e.data.action === "handleOpenAudio") {
    handleOpenAudio();
  } else if (e.data.action === "handleCloseAudio") {
    handleCloseAudio();
  } else if (e.data.action === "handleChangeRes") {
    handleChangeRes(e.data.data);
  } else if (e.data.action === "openSpeaker") {
    openSpeaker();
  } else if (e.data.action === "closeSpeaker") {
    closeSpeaker();
  } else if (e.data.action === "openMic") {
    openMic();
  } else if (e.data.action === "closeMic") {
    closeMic();
  } else if (e.data.action === "handleWiFiConnect") {
    handleWiFiConnect(e.data.data);
  } else if (e.data.action === "handleUpdateWifiList") {
    handleUpdateWifiList();
  } else if (e.data.action === "clearUpdateWifiList") {
    clearUpdateWifiList();
  } else if (e.data.action === "sendDataChannel") {
    sendDataChannel(e.data.data);
  } else if (e.data.action === "setVideoFitMode") {
    setVideoFitMode(e.data.data);
  } else if (e.data.action === "checkVersion") {
    checkVersion();
  } else if (e.data.action === "updateVersion") {
    updateVersion();
  }
});



//监听窗口变化，更新视频方向
const updateOrientation = () => {
  if (window.innerWidth < window.innerHeight) {
    //那么视频需要旋转90度
    videoRef.value.style.transform = 'rotate(90deg)';
    videoRef.value.style.width = '100vh';
    videoRef.value.style.height = '100vw';
    videoRef.value.style.position = 'absolute';
    videoRef.value.style.top = '50%';
    videoRef.value.style.left = '50%';
    videoRef.value.style.marginTop = '-50vw';
    videoRef.value.style.marginLeft = '-50vh';
    //videoInfoRef.value.style.transform = 'rotate(90deg)';
    //videoInfoRef.value.style.top = '35px';
    //videoInfoRef.value.style.right = '-10px';
    //videoInfoRef.value.style.left = 'auto';
    wifiIconRef.value.style.transform = 'rotate(90deg)';
  } else {
    //那么视频需要旋转0度
    videoRef.value.style.transform = 'rotate(0deg)';
    videoRef.value.style.width = '100%';
    videoRef.value.style.height = '100%';
    videoRef.value.style.position = 'static';
    videoRef.value.style.top = 'auto';
    videoRef.value.style.left = 'auto';
    videoRef.value.style.marginTop = 'auto';
    videoRef.value.style.marginLeft = 'auto';
    // videoInfoRef.value.style.transform = 'rotate(0deg)';
    // videoInfoRef.value.style.top = '10px';
    // videoInfoRef.value.style.right = '10px';
    // videoInfoRef.value.style.left = 'auto';
    wifiIconRef.value.style.transform = 'rotate(0deg)';
  }
}

// ------------------- 生命周期钩子 -------------------
onMounted(async () => {
  // 组件挂载时初始化 Peer ID
  peer_id = +getClientId(6);
  token = getUrlParam('token');
  const rawVal = getUrlParam('initAction');
  // 只有在有效值列表内才赋值，否则保持 null
  if (initActionValidList.includes(rawVal)) {
    initAction = rawVal;
  }

  localStorage.setItem('video_token', token)
  isShowWifiIcon();
  //初始化ws连接
  socket = new InitWebSocket(peer_id, token, handleMessage);
  // 从 URL 获取 remote_peer_id
  remote_peer_id = getUrlParam('device_id');
  // 监听窗口变化，更新视频方向
  window.addEventListener("resize", updateOrientation);
  window.addEventListener("orientationchange", updateOrientation);
  updateOrientation();

  // 是不是小程序
  // const inMini = await checkMiniProgram();
  // if (inMini) {
  //   await nextTick();
  //   handleLoad();
  // }


  if (getUrlParam('videoDefinition')) {
    const targetValues = getUrlParam('videoDefinition').split(",");
    qualityList.value = qualityListMap.filter((item) =>
      targetValues.includes(item.value),
    );
    currentQuality.value = getUrlParam('defaultCameraClarity') + '';
  } else {
    qualityList.value = qualityListMap;
    currentQuality.value = '2'
  }

  const closeFlagVal = getUrlParam('closeFlag');
  if (closeFlagVal == 1) {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      handleCloseAudio();
      handleCloseVideo();
    }, 2000)
    return;
  }
});
const hasMicOpen = ref(false);
const hasMicClose = ref(false);
const hasSpeakerOpen = ref(false);
const hasSpeakerClose = ref(false);
const hasRes1 = ref(false);
const hasRes2 = ref(false);
const hasRes3 = ref(false);
const videoFlag = ref(false);

const paramTimer = ref(null);
const handleLoad = () => {
  if (!paramTimer.value) {
    paramTimer.value = setInterval(() => {
      if (initAction == 'video_audio' && !videoFlag.value) {
        videoFlag.value = true;
        handleOpenAudio();
      }
    }, 1500)
  } else {
    clearInterval(paramTimer.value)
  }
}


const checkMiniProgram = () => {
  return new Promise((resolve) => {
    if (window.__wxjs_environment === 'miniprogram') {
      resolve(true);
    } else if (typeof wx !== 'undefined' && wx.miniProgram) {
      wx.miniProgram.getEnv((res) => {
        resolve(res.miniprogram);
      });
    } else {
      resolve(false);
    }
  });
};

const resRatioObj = Object.freeze({
  2: "1920x1080",
  3: "1280x720",
  4: "640x480",
})
const handleSelect = (value) => {
  currentQuality.value = value;
  handleChangeRes(resRatioObj[value])
  ElMessage.success(`切换成功`);
};


const rippleActive = ref(false);

const startRipple = () => {
  rippleActive.value = true;
};

const stopRipple = () => {
  rippleActive.value = false;
  closeMic()
  isMicOpen.value = false;
};

let isFlag = false;
const handleMic = async () => {
  isMicOpen.value = !isMicOpen.value
  if (isMicOpen.value) {
    if (isFlag) {
      openMic();
    } else {
      isFlag = true
      await handleOpenAudio();
      const timer = setTimeout(() => {
        clearTimeout(timer)
        closeSpeaker();
      }, 1000)
    }
  } else {
    closeMic()
  }
}

const handleSound = async () => {
  isSoundOpen.value = !isSoundOpen.value
  if (isSoundOpen.value) {
    if (isFlag) {
      openSpeaker();
    } else {
      isFlag = true
      await handleOpenAudio();
      const timer = setTimeout(() => {
        clearTimeout(timer)
        closeMic();
      }, 1000)
    }
  } else {
    closeSpeaker()
  }
}

onUnmounted(() => {
  // 组件卸载时关闭连接
  closeP2P();
  // 移除窗口变化事件监听
  window.removeEventListener("resize", updateOrientation);
  window.removeEventListener("orientationchange", updateOrientation);
  paramTimer.value && clearInterval(paramTimer.value)
});
</script>

<style lang="scss" scoped>
// 全局样式变量，便于统一管理
$primary-color: #165DFF;
$secondary-color: #6B7280;
$success-color: #00B42A;
$danger-color: #F53F3F;
$background-color: #F9FAFB;
$card-bg-color: #FFFFFF;
$border-color: #E5E7EB;
$text-primary: #111827;
$text-secondary: #6B7280;
$border-radius: 8px;
$shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
$shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
$transition: all 0.2s ease-in-out;

.video-player-container {
  width: 100%;
  background: $card-bg-color;
  border-radius: $border-radius;
  box-shadow: $shadow-md; // 增加阴影提升质感
  box-sizing: border-box;
}

.video-item {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px; // 增大间距，提升呼吸感
}

.video-wrapper {
  width: 100%;
  height: 100vh;
  background: #000000;
  border-radius: $border-radius;
  overflow: hidden;
  position: relative;
  aspect-ratio: 16/9; // 保持16:9的视频比例

  .video-element {
    width: 100%;
    height: 100%;
    display: block;
  }

  .audio-element {
    position: absolute;
    bottom: 16px;
    left: 16px;
    width: 300px;
    z-index: 10;
    opacity: 0.9;
    transition: $transition;

    &:hover {
      opacity: 1;
    }
  }

  .wifi-icon-wrap {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: rgba(124, 122, 122, 0.3);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    z-index: 10;
    transition: transform 0.3s ease;
    backdrop-filter: blur(4px);
    cursor: pointer;
  }

  .video-res {
    position: absolute;
    top: 10px;
    left: 50px;
    width: 145px;
    height: 32px;
    z-index: 10;

    span {
      font-size: 10px;
      display: inline-block;
      width: 25px;
      height: 25px;
      line-height: 25px;
      border-radius: 50%;
      border: 1px solid #f5c542;
      color: #fff;
      background-color: rgba(0, 0, 0, 0.5);
      margin-right: 10px;
    }

    .active {
      color: #f5c542;
    }
  }

  .icon-wrap {
    position: absolute;
    width: 32px;
    height: 32px;
    z-index: 10;
    transition: transform 0.3s ease;
    backdrop-filter: blur(4px);
    cursor: pointer;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mic-wrap {
    top: 80px;
    right: 55px;
  }

  .ripple {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 200%; // 比父容器大两倍
    height: 200%;
    transform: translate(-50%, -50%) scale(0.5); // 初始缩放调整，使波纹从中心开始
    border-radius: 50%;
    background: rgba(245, 197, 66, 0.8); // 透明度降低，更柔和
    pointer-events: none;
    z-index: 5;
    animation: ripplePulse 1.2s ease-in-out infinite;
  }

  @keyframes ripplePulse {
    0% {
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 0.5;
    }

    50% {
      transform: translate(-50%, -50%) scale(1.6);
      opacity: 0.1;
    }

    100% {
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 0.5;
    }
  }


  //   width: 300%;           // 增大容器，让波纹扩散范围更广
  //   height: 300%;
  //   transform: translate(-50%, -50%) scale(0.2); // 初始状态：很小
  //   border-radius: 50%;
  //   background: rgba(255, 200, 56, 0.5); // 初始颜色稍深
  //   pointer-events: none;
  //   z-index: 5;
  //   animation: rippleExpand 2s linear infinite; // 线性运动，无限循环
  // }

  // @keyframes rippleExpand {
  //   0% {
  //     transform: translate(-50%, -50%) scale(0.2);
  //     opacity: 0.6;
  //   }
  //   100% {
  //     transform: translate(-50%, -50%) scale(1.5);  // 向外扩散到最大
  //     opacity: 0;            // 完全透明消失
  //   }
  // }
  .sound-wrap {
    top: 120px;
    right: 55px;
  }

  .icon-image {
    width: 27px;
    height: 27px;

    -webkit-touch-callout: none;
    user-select: none;
    pointer-events: none;
  }
}

.video-info {
  position: fixed;
  top: 10px;
  right: 10px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 100;
  backdrop-filter: blur(4px);

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;

    .info-label {
      color: rgba(255, 255, 255, 0.7);
      font-weight: 400;
      min-width: 50px;
    }

    .info-value {
      color: rgba(255, 255, 255, 0.9);
      font-weight: 500;
    }
  }
}

// 核心修改：优化开关布局，添加文字标签
.video-controls {
  //半透明
  background-color: rgba(255, 255, 255, 0.8);
  position: fixed;
  top: 12px;
  left: 12px;
  gap: 24px;
  padding: 8px;
  align-items: center; // 垂直居中
  border-radius: $border-radius;

  .switch-item {
    display: flex;
    align-items: center;
    gap: 10px; // 文字与开关的间距

    .switch-label {
      font-size: 15px;
      font-weight: 500;
      color: $text-primary;
      white-space: nowrap; // 防止文字换行
    }
  }
}



// 响应式适配
@media (max-width: 768px) {
  .video-player-container {
    height: 100vh;
    margin: 0 auto;
  }

  .video-wrapper .audio-element {
    width: 100%;
    left: 0;
    bottom: 0;
    border-radius: 0;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .video-controls {
    flex-direction: column; // 小屏幕开关垂直排列
    align-items: flex-start;
    gap: 16px;
  }

  .switch-item {
    width: 100%;
    justify-content: space-between;
  }
}
</style>