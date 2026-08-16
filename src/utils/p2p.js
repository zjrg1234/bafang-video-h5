import { getDeviceInfo } from "../api";

// ------------------- PeerConnection 核心类 -------------------
class PeerConnection {
  constructor(callback,peer_id,socket) {
    this.callback = callback;
    this.peer_id = peer_id;
    this.socket = socket;
    this.connection = null;
    this.audioSender = null;
    this.local_stream = null;
    this.lastBytesReceived = 0;
    this.lastTimestamp = 0;
    this.bytesTimer = null;
    this.statsTimer = null;
    this.dataChannel = null;
    this.isDataChannelReady = false;
  }

  async createPeer(json) {
    if (!this.connection) {
      // 初始化 RTCPeerConnection
      const deviceInfo = await getDeviceInfo({device_id: json.peer_id});
      console.log(deviceInfo)
      if(deviceInfo.code == 403){
        this.callback('connection_state', {'state':'权限不足'});
        return;
      }
      const configuration = {
        iceServers: [{
          urls: deviceInfo.data.ice_server,
          username: deviceInfo.data.ice_user,
          credential: deviceInfo.data.ice_pwd
        }]
      };
      this.connection = new RTCPeerConnection(configuration);
      this.connection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
      };
      // 监听连接状态变化
      this.connection.addEventListener('connectionstatechange', () => {
        const state = this.connection.connectionState;
        switch (state) {
          case 'connected':
          case 'completed':
            this.callback('connection_state', {'state':'已连接'});
            break;
          case 'disconnected':
            this.callback('connection_state', {'state':'波动中'});
            break;
          case 'failed':
            this.callback('connection_state', {'state':'连接失败'});
            break;
          case 'closed':
            this.callback('connection_state', {'state':'连接已关闭'});
            break;
        }
      });

      // 监听 ICE 候选
      this.connection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.send({
            type: 100,
            sub_type: 103,
            remote_peer_id: json.peer_id,
            data: event.candidate,
            peer_id: this.peer_id
          });
        }
      };

      // 监听音视频轨道
      this.connection.ontrack = (event) => {
        // 处理视频轨道
        if (event.track.kind === 'video') {
          let firstFrameDetected = false;
          const firstFrameTimer = setInterval(async () => {
            try {
              const stats = await this.connection.getStats();
              stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video' && report.framesReceived > 0 && !firstFrameDetected) {
                  firstFrameDetected = true;
                   clearInterval(firstFrameTimer); 
                  this.callback('connection_state', { 'state': '视频第一帧到达' });
                }
              });
            } catch (err) {}
          }, 10);
          this.callback('add_video',{stream:event.streams[0]});
          // 启动码率统计
          this.startBitrateStats(event.streams[0]);
        }
        // 处理音频轨道
        else if (event.track.kind === 'audio') {
          this.callback('add_audio',{stream:event.streams[0]});
        }
        // 启动分辨率/编码统计
        this.startStatsTimer();
      };
    }
    // 处理不同子类型的信令
    switch (json.sub_type) {
      case 150:
        await this.handleDataChannelOffer(json);
        break;
      case 160:
        await this.handleOffer(json);
        break;
      case 161:
        await this.handleAudioStop(json);
        break;
      case 103:
        await this.addIceCandidate(json);
        break;
      default:
        console.warn('未知信令子类型:', json.sub_type);
    }

    return this.connection;
  }

  // 150信令：DataChannel Offer 处理
  async handleDataChannelOffer(json) {
    await this.connection.setRemoteDescription({
      type: 'offer',
      sdp: json.data.sdp
    });
    // 主动创建dataChannel
    this.dataChannel = this.connection.createDataChannel('dataChannel', {
      ordered: true
    });
    this.setupDataChannelListeners();

    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    this.socket.send({
      type: 100,
      sub_type: 150,
      remote_peer_id: json.peer_id,
      data: { sdp: answer.sdp },
      peer_id: this.peer_id
    });
  }

  // 处理 Offer 并发送 Answer
  async handleOffer(json) {
    await this.connection.setRemoteDescription({
      type: 'offer',
      sdp: json.data.sdp
    });
    // 如果需要发送本地音频（按需启用）
    if(json.sub_type === 160){
      await this.addLocalAudio();
    }
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    // 发送 Answer 到服务端
    this.socket.send({
      type: 100,
      sub_type: json.sub_type,
      remote_peer_id: json.peer_id,
      data: { device_id: null, sdp: answer.sdp },
      peer_id: this.peer_id
    });
    this.callback('connection_state', {'state':'sdp交互完成'});
  }

  // 绑定dataChannel收发事件
  setupDataChannelListeners() {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      this.isDataChannelReady = true;
      console.log('数据通道已打开');
      this.callback('connection_state', { state: '数据通道已建立' });
    };

    this.dataChannel.onclose = () => {
      this.isDataChannelReady = false;
      this.callback('connection_state', { state: '数据通道已关闭' });
    };

    this.dataChannel.onerror = (err) => {
      this.callback('connection_state', { state: '数据通道错误,' + err.message });
    };

    // 接收对端数据
    this.dataChannel.onmessage = (event) => {
      let res = event.data;
      this.callback('datachannel_message', res);
    };
  }

  // 添加本地音频（按需使用）
  async addLocalAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.local_stream = stream;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.audioSender = this.connection.addTrack(audioTracks[0], stream);
      }
    } catch (error) {
      console.error('获取本地音频失败:', error);
      this.callback('connection_state', {'state':'mic_forbid'});
    }
  }

  // 停止本地音频
  async handleAudioStop(json) {
    if (this.audioSender) {
      this.connection.removeTrack(this.audioSender);
      console.log('本地音频已停止');
      this.local_stream?.getTracks().forEach(track => track.stop());
      this.local_stream = null;
      this.audioSender = null;
    }
    await this.connection.setRemoteDescription({
      type: 'offer',
      sdp: json.data.sdp
    });
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    //通知上层音频已停止
    this.callback('audio_stop');
    this.socket.send({
      type: 100,
      sub_type: 161,
      remote_peer_id: json.peer_id,
      data: { sdp: answer.sdp },
      peer_id: this.peer_id
    });
  }

  // 添加 ICE 候选
  async addIceCandidate(json) {
    try {
      await this.connection.addIceCandidate(json.data);
      this.callback('connection_state', {'state':'ice候选添加完成'});
    } catch (error) {
      console.error('添加 ICE 候选失败:', error);
    }
  }

  // 启动码率统计
  startBitrateStats(stream) {
    if (this.bytesTimer) clearInterval(this.bytesTimer);
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    this.bytesTimer = setInterval(async () => {
      try {
        const stats = await this.connection.getStats(videoTracks[0]);
        let currentBytes = 0;
        let currentTime = Date.now();
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            currentBytes = report.bytesReceived || 0;
            currentTime = report.timestamp || currentTime;
          }
        });

        // 计算码率 (KB/s)
        if (this.lastBytesReceived > 0 && currentTime > this.lastTimestamp) {
          const timeDiff = (currentTime - this.lastTimestamp) / 1000;
          const bytesDiff = currentBytes - this.lastBytesReceived;
          const bitrate = (bytesDiff / 1024) / timeDiff;
          this.callback('video_bitrate',{bitrate:bitrate.toFixed(1)});
        }

        this.lastBytesReceived = currentBytes;
        this.lastTimestamp = currentTime;
      } catch (error) {
        console.error('码率统计失败:', error);
      }
    }, 1000);
  }

  // 启动分辨率/编码统计
  startStatsTimer() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = setInterval(async () => {
      try {
        const stats = await this.connection.getStats();
        stats.forEach(report => {
          // 获取编码信息
          if (report.type === 'codec' && report.mimeType.includes('video')) {
            this.callback('video_codec',{codec:report.mimeType.split('/')[1] || 'unknown'});
          }
          // 获取分辨率信息
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (report.frameWidth && report.frameHeight) {
              this.callback('video_resolution',{resolution:`${report.frameWidth}x${report.frameHeight}`});
            }
          }
        });
      } catch (error) {
        console.error('分辨率统计失败:', error);
      }
    }, 1000);
  }
  sendData(msg) {
    if(!this.dataChannel || this.dataChannel.readyState !== 'open'){
      return false;
    }
    // const data = typeof msg === 'object' ? JSON.stringify(msg) : msg;
    this.dataChannel.send(msg);
    return true;
  }
  // 关闭连接
  close() {
    if(this.dataChannel){
      this.dataChannel.close();
      this.dataChannel = null;
    }
    this.isDataChannelReady = false;
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.local_stream?.getTracks().forEach(track => {
      track.stop();
      this.local_stream = null;
    });
    this.audioSender = null;
    clearInterval(this.bytesTimer);
    clearInterval(this.statsTimer);
    this.bytesTimer = null;
    this.statsTimer = null;
  }
}

export default PeerConnection;