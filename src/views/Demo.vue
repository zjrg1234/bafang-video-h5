<template>
  <div class="app-wrap">
    <!-- 步骤1：登录 -->
    <div class="page page-login" v-if="currentStep === 1">
      <div class="card">
        <h3>用户登录</h3>
        <el-form label-width="80px" @submit.prevent="doLogin">
          <el-form-item label="用户名">
            <el-input v-model="loginForm.username" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="loginForm.password" type="password" show-password placeholder="请输入密码" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" native-type="submit" :loading="loading" block>登录</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 步骤2：设置摄像头ID -->
    <div class="page page-set" v-if="currentStep === 2">
      <div class="card">
        <h3>设置摄像头</h3>
        <el-form label-width="100px">
          <el-form-item label="摄像头 ID">
            <el-input v-model="tempDeviceId" placeholder="请输入" />
          </el-form-item>
          <el-form-item label="自动播放配置">
              <el-checkbox v-model="autoOpenVideo" @change="handleVideoCheckChange">视频</el-checkbox>
              <el-checkbox v-model="autoOpenAudio" :disabled="!autoOpenVideo">音频</el-checkbox>
          </el-form-item>
          <el-form-item class="btn-row">
            <el-button @click="logout">退出登录</el-button>
            <el-button type="primary" @click="goToVideo">进入播放</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 步骤3：视频播放页（单个iframe） -->
    <div class="page page-player" v-if="currentStep === 3">
      <!-- 悬浮控制面板 -->
      <div class="control-float">
        <el-button
          type="primary"
          size="small"
          @click="showExpand = !showExpand"
        >
          {{ showExpand ? '收起控制面板' : '展开控制面板' }}
        </el-button>

        <transition name="fold">
          <div class="control-panel" v-show="showExpand">
            <div class="device-line">
              <div class="device-info">
                <span class="id-tag">
                  <span class="status-dot" :class="{ online: deviceOnline === 1 }"></span>
                  摄像头：{{ deviceId }}
                  <i class="fa fa-refresh" @click="checkDeviceOnline"></i>
                </span>
                <span class="version-tag" @click="checkVersion">
                  <i class="fa fa-refresh" style="margin-right: 3px;"></i>版本监测
                </span>
              </div>
              <div class="device-btn-row"> 
                <el-button
                  type="primary"
                  size="small"
                  @click="showLogArea = true"
                >
                  日志记录
                </el-button>
                <el-button size="small" @click="goBackSet">返回设置</el-button>
                <el-button v-if="initStatus" type="primary" size="small" @click="showWifiArea = true">
                    <i class="fa fa-wifi" style="margin-right: 2px;"></i>
                    网络配置
                </el-button>
              </div>
              
            </div>
            <div class="batch-row" v-if="initStatus">
                <div class="switch-row">
                    <div class="switch-item">
                        <span class="switch-label">视频：</span>
                        <el-switch
                            v-model="showVideo"
                            :active-value="true"
                            :inactive-value="false"
                            @change="changeVideo"
                        />
                    </div>
                    <div class="switch-item">
                        <span class="switch-label">音频：</span>
                        <el-switch
                            v-model="showAudio"
                            :active-value="true"
                            :inactive-value="false"
                            @change="changeAudio"
                        />
                    </div>
                    <div class="switch-item">
                        <span class="switch-label">麦克风：</span>
                        <el-switch
                            v-model="showMic"
                            :active-value="true"
                            :inactive-value="false"
                            :disabled="disabledMic"
                            @change="changeMic"
                        />
                    </div>
                    <div class="switch-item">
                        <span class="switch-label">扬声器：</span>
                        <el-switch
                            v-model="showSpeaker"
                            :active-value="true"
                            :inactive-value="false"
                            :disabled="disabledSpeaker"
                            @change="changeSpeaker"
                        />
                    </div>
                </div>
                <!-- 这个区域放置分辨率修改器、数据发送器、wifi设置区域进入按钮 -->
                <div class="resolution-item">
                    <span class="resolution-label">分辨率：</span>
                    <el-select v-model="resolution" placeholder="请选择" @change="changeResolution">
                        <el-option v-for="item in resolutionList" :label="item" :value="item" :key="item" />
                    </el-select>
                </div>
                <div class="fit-item">
                  <span class="fit-label">画面适配：</span>
                  <el-select v-model="fitMode" placeholder="请选择" @change="changeFitMode">
                    <el-option label="拉伸填满(fill)" value="fill" />
                    <el-option label="完整留黑边(contain)" value="contain" />
                    <el-option label="铺满裁切(cover)" value="cover" />
                  </el-select>
                </div>
                <div class="data-send-item">
                    <div class="data-send-label">数据收发：</div>
                    <div class="data-send-row">
                        <el-input v-model="sendDataText" placeholder="输入发送内容" class="input-data" />
                        <el-button size="small" type="primary" @click="sendData">发送</el-button>
                        <el-button size="small" @click="sendDataText = ''">清空</el-button>
                    </div>
                    <div class="data-log" :class="{ empty: dataLogList.length === 0 }">
                        <div class="log-item" v-for="(item, i) in dataLogList" :key="i">{{ item }}</div>
                        <div class="no-data-log" v-if="dataLogList.length === 0">此处显示收到的数据记录</div>
                    </div>
                </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- 单个视频区域 -->
      <div class="video-container">
        <div class="video-box">
          <iframe 
            ref="iframeRef" 
            :src="videoUrl" 
            frameborder="0" 
            class="iframe"
          ></iframe>
        </div>
      </div>
    </div>
    <!-- 日志弹窗 -->
    <div class="log-container" v-if="showLogArea">
      <div class="log-card">
        <div class="log-header">
          <h3>设备通信日志</h3>
          <div class="log-btns">
            <el-button size="small" @click="clearAllLog">清空</el-button>
            <el-button size="small" @click="showLogArea = false">关闭</el-button>
          </div>
        </div>
        <div class="log-content" ref="logScrollRef">
          <div class="log-line" v-for="(item,idx) in fullLogList" :key="idx">{{item}}</div>
          <div class="log-empty" v-if="fullLogList.length===0">暂无日志</div>
        </div>
      </div>
    </div>
    <!-- wifi配置区域 -->
    <div class="wifi-container" v-if="showWifiArea" v-loading="connectLoading" :element-loading-text="`连接${wifiName}中...请稍候..`">
        <div class="wifi-card">
            <div class="wifi-header">
            <h3>WiFi 网络配置</h3>
            <el-button size="small" @click="() => {showWifiArea = false;wifiName = '';wifiPwd = '';wifiList = [];}">关闭</el-button>
            </div>

            <div class="wifi-body">
                <!-- WiFi 列表 -->
                <div class="wifi-list-box">
                    <div class="wifi-list-header">可用WiFi列表</div>
                    <div class="wifi-list">
                    <div 
                        class="wifi-item"
                        v-for="item in wifiList" 
                        :key="item.name"
                        @click="selectWifi(item)"
                    >
                        <div class="wifi-name">
                        <i class="fa fa-wifi"></i>
                        {{ item.name }}
                        </div>
                        <div class="wifi-status" :class="{ connected: item.connected }">
                        {{ item.connected ? '已连接' : '可用' }}
                        </div>
                    </div>

                    <div class="no-wifi" v-if="wifiList.length === 0">
                        加载中...
                    </div>
                    </div>
                </div>

                <!-- WiFi 连接表单 -->
                <div class="wifi-form">
                    <el-form label-width="80px">
                    <el-form-item label="WiFi名称">
                        <el-input v-model="wifiName" placeholder="自动选择或手动输入" />
                    </el-form-item>
                    <el-form-item label="WiFi密码">
                        <el-input v-model="wifiPwd" type="password" show-password placeholder="请输入WiFi密码" />
                    </el-form-item>
                    <el-form-item style="margin-top: 10px; text-align: right;">
                        <el-button size="small" @click="() => {showWifiArea = false;wifiName = '';wifiPwd = '';wifiList = [];}">取消</el-button>
                        <el-button size="small" type="primary" @click="connectWifi">开始配网</el-button>
                    </el-form-item>
                    </el-form>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { encrypt } from '../utils'
import { listAllDevice, login, getDeviceInfo } from '../api'
import { debounce } from 'lodash'

// 步骤 1登录 2设置 3播放
const currentStep = ref(1)

// 登录
const loginForm = ref({ username: '', password: '' })
const token = ref('')
const loading = ref(false)

// 设备ID
const tempDeviceId = ref('')
const deviceId = ref('')

// 视频
const showVideo = ref(false)
const videoUrl = ref('')
const baseUrl = '/'
const iframeRef = ref(null)
// 音频
const showAudio = ref(false)
// 麦克风
const showMic = ref(false)
// 扬声器
const showSpeaker = ref(false)
// 麦克风和扬声器是否禁用
const disabledMic = ref(false)
const disabledSpeaker = ref(false)

// 分辨率
const resolution = ref('')
// 分辨率列表
const resolutionList = ref([])
// 画面适配
const fitMode = ref('fill')
// 数据收发
const sendDataText = ref('')
const dataLogList = ref([])

// 折叠控制
const showExpand = ref(true)
// wifi配置区域
const showWifiArea = ref(false)
// wifi列表
const wifiList = ref([])
// 配网绑定变量
const wifiName = ref('')
const wifiPwd = ref('')
// 配网loading
const connectLoading = ref(false)
// 初始化状态
const initStatus = ref(false)
// 日志记录区域
const showLogArea = ref(false)
// 完整日志
const fullLogList = ref([])
const logScrollRef = ref(null)

// 全局写入日志方法
const pushLog = (text) => {
  fullLogList.value.push(text)
  nextTick(()=>{
    if(logScrollRef.value) logScrollRef.value.scrollTop = logScrollRef.value.scrollHeight
  })
}
// 清空日志
const clearAllLog = ()=>{
  fullLogList.value = []
}
// 查版本
const checkVersion = () => {
  if(!iframeRef.value) return
  iframeRef.value.contentWindow.checkVersion()
}
onMounted(() => {
  const t = localStorage.getItem('video_token')
  if (t) {
    token.value = t
    currentStep.value = 2
  }
})

watch(token, (val) => {
  if (!val) currentStep.value = 1
  if(val){
    listAllDevice().then(res => {
      if(res.msg === '请先登录' || res.msg === '登录已过期，请重新登录') {
        ElMessage.error(res.msg);
        logout()
      }
    })
  }
})

// 退出
const logout = () => {
  token.value = ''
  initStatus.value = false
  localStorage.removeItem('video_token')
}

// 登录
const doLogin = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请输入账号密码')
    return
  }
  loading.value = true
  try {
    const pwd = encrypt(loginForm.value.password)
    const res = await login({
      username: loginForm.value.username,
      password: pwd,
      usertype: '0'
    })
    if (res.code === 200) {
      token.value = res.data.token
      localStorage.setItem('video_token', token.value)
      ElMessage.success('登录成功')
      currentStep.value = 2
    } else {
      ElMessage.error(res.msg?.message || '登录失败')
    }
  } catch (e) {
    ElMessage.error('请求异常')
  } finally {
    loading.value = false
  }
}
function formatDateWithMs() {
  const d = new Date()
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const H = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${Y}-${M}-${D} ${H}:${m}:${s}.${ms}`
}
// 监听iframe上报
const onReport = (e) => {
  const { code, reportContent } = e.detail
  console.log(`收到上报上报码${code}，上报内容${reportContent},上报时间${formatDateWithMs()}`)
  if(code != 302){
    const logStr = `[${formatDateWithMs()}] 上报码:${code} 内容:${reportContent}`
    pushLog(logStr)
  }
  switch (code) {
    case 302:
        //302 设备wifi列表上报
        wifiList.value = JSON.parse(reportContent)
        break
    case 305:
        //305 设备参数信息上报，可据此拿到可支持分辨率列表
        const params = JSON.parse(reportContent)
        if(params?.Resolution){
            resolution.value = params.Resolution
        }
        if(params?.res_sup && Array.isArray(params.res_sup)){
            resolutionList.value = params.res_sup;
        }
        break
    case 907:
        //设备传回来的数据
        const realData = JSON.parse(reportContent);
        dataLogList.value.push(JSON.stringify(realData, null, 2));
        break;
    case 908:
        if(!connectLoading.value){
          //wifi配置下可忽略离线状态，因为配网会经历一会儿断开网络
          ElMessage.error(`${deviceId.value}：${reportContent}`)
          resetConfig()
        }
        break
    case 909:
        //console.log('收到设备状态信息',reportContent)
        //说明此时麦克风权限未开启，禁用麦克风
        if(reportContent && reportContent === 'mic_forbid'){
          disabledMic.value = true
          showMic.value = false
          ElMessage.error('麦克风权限未开启，无法使用麦克风')
        }
        if(reportContent && reportContent === 'webrtc_usable'){
          ElMessage.success('WebRTC环境正常')
        }
        if(reportContent && reportContent === 'webrtc_no_support'){
          ElMessage.error('浏览器不支持WebRTC或非HTTPS环境')
        }
        break
    case 910:
        //接口调用结果
        const result = JSON.parse(reportContent)
        handleMethodCallback(result.method, result.ret, result.state)
        break
    case 911:
        //wifi连接结果
        const connectResult = JSON.parse(reportContent)
        connectLoading.value = false
        if(connectResult.ret){
            ElMessage.success(`连接${connectResult.wifiName}成功`)
            wifiName.value = ''
            wifiPwd.value = ''
        }else{
            ElMessage.error(`连接${connectResult.wifiName}失败`)
        }
        break
    case 912:
        //初始化状态，此后所有操作基于此状态下有效
        const initData = JSON.parse(reportContent)
        if (initData) {
          initStatus.value = initData.ret
          initData.ret ? ElMessage.success(initData.state) : ElMessage.error(initData.state)
        }
        break
    default:
        break
  }
}

// 处理接口回调
const handleMethodCallback = (method, ret, state) => {
  switch (method) {
    case 'handleOpenVideo':
            showVideo.value = ret
            if(!ret){
                ElMessage.error(`打开失败：${state}`)
            }
        break
    case 'handleCloseVideo':
        if(ret){
            showVideo.value = false
            showAudio.value = false
            showMic.value = false
            showSpeaker.value = false
        }else{
            showVideo.value = true
            ElMessage.error(`关闭失败：${state}`)
        }
        break
    case 'handleOpenAudio':
        //默认麦克风和扬声器在音频打开后为打开状态
        showAudio.value = ret
        showMic.value = ret
        showSpeaker.value = ret
        disabledMic.value = !ret
        disabledSpeaker.value = !ret
        if(!ret){
            ElMessage.error(`打开失败：${state}`)
        }
        break
    case 'handleCloseAudio':
        showAudio.value = !ret
        showMic.value = !ret
        showSpeaker.value = !ret
        disabledMic.value = ret
        disabledSpeaker.value = ret
        if(!ret){
            ElMessage.error(`关闭失败：${state}`)
        }
        break
    case 'openMic':
        showMic.value = ret
        if(!ret){
          ElMessage.error(`打开失败：${state}`)
        }
        break
    case 'closeMic':
        showMic.value = !ret
        if(!ret){
            ElMessage.error(`关闭失败：${state}`)
        }
        break
    case 'openSpeaker':
        showSpeaker.value = ret
        if(!ret){
          ElMessage.error(`打开失败：${state}`)
        }
        break
    case 'closeSpeaker':
        showSpeaker.value = !ret
        if(!ret){
            ElMessage.error(`关闭失败：${state}`)
        }
        break
    case 'handleChangeRes':
        if(ret){
            ElMessage.success(`切换成功：${state}`)
        }else{
            resolution.value = preResolution
            ElMessage.error(`切换失败：${state}`)
        }
        break
    case 'setVideoFitMode':
        if(ret){
            ElMessage.success(`设置成功：${state}`)
        }else{
            ElMessage.error(`设置失败：${state}`)
        }
        break
    case 'sendDataChannel':
        if(ret){
            sendDataText.value = ''
            ElMessage.success(`发送成功：${state}`)
        }else{
            ElMessage.error(`发送失败：${state}请检查视频是否打开`)
        }
        break
    case 'handleWiFiConnect':
        //接口调用成功才进行连接中的用户提示
        connectLoading.value = ret
        break
    case 'checkVersion':
        if(ret){
            if(state.includes('是否更新')){
              ElMessageBox.confirm(
                state,
                '固件更新',
                {
                  confirmButtonText: '更新版本',
                  cancelButtonText: '取消操作',
                  type: 'warning',
                }
              )
              .then(() => {
                if(iframeRef.value){
                  iframeRef.value.contentWindow.updateVersion()
                }
              })
              .catch(() => {
                ElMessage({
                  type: 'info',
                  message: '已取消更新操作',
                })
              })
            }else{
                ElMessage.success(state)
            }
        }else{
            ElMessage.error(`检查版本失败：${state}`)
        }
        break
    case 'updateVersion':
      if(ret){
          ElMessage.success(state)
          if(state.includes('设备固件下载完成')){
            goBackSet()
          }
      }else{
          ElMessage.error(state)
      }
      break
    default:
        break
  }
}

// 设置页面自动播放勾选
const autoOpenVideo = ref(false)
const autoOpenAudio = ref(false)

// 取消视频勾选时，自动取消音频
const handleVideoCheckChange = () => {
  if (!autoOpenVideo.value) {
    autoOpenAudio.value = false
  }
}

//设备在线状态
const deviceOnline = ref(0)

// 进入播放页
const goToVideo = async () => {
  if (!tempDeviceId.value) {
    ElMessage.warning('请输入设备ID')
    return
  }
  //必须是数字格式
  if(!/^\d+$/.test(tempDeviceId.value)){
    ElMessage.warning('请输入ID必须是数字')
    return
  }
  deviceId.value = tempDeviceId.value

  let queryStr = `device_id=${deviceId.value}&token=${token.value}`
  if(autoOpenVideo.value){
    if(autoOpenAudio.value){
      queryStr += '&initAction=video_audio'
    }else{
      queryStr += '&initAction=video_only'
    }
  }
  videoUrl.value = `${baseUrl}?${queryStr}`
  currentStep.value = 3
  checkDeviceOnline()
  await nextTick()
  iframeRef.value.contentWindow.addEventListener('nativeReport', onReport)
}

//检查设备在线状态
const checkDeviceOnline = () => {
  getDeviceInfo({
    device_id: deviceId.value
  }).then(res => {
    if(res.code === 200){
      deviceOnline.value = res.data.online_type
      console.log('设备在线状态:', deviceOnline.value)
    }
  })
}

const goBackSet = () => {
  if(iframeRef.value && showVideo.value){
    iframeRef.value.contentWindow.handleCloseVideo()
  }
  currentStep.value = 2
  resetConfig()
  clearAllLog()
}

// 重置配置
const resetConfig = () => {
    showVideo.value = false
    showAudio.value = false
    showMic.value = false
    showSpeaker.value = false
    resolution.value = ''
    resolutionList.value = []
    sendDataText.value = ''
    dataLogList.value = []
    initStatus.value = false
    deviceOnline.value = 0
}


// 视频开关
const changeVideo = debounce(() => {
  const now = new Date()
// 毫秒时间戳
const ms = now.getTime()
// 格式化带毫秒的本地时间
const formatTime = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}.${now.getMilliseconds().toString().padStart(3,'0')}`

console.log('可读时间(含毫秒):', formatTime)
    if(!iframeRef.value) return
    if (showVideo.value) {
        iframeRef.value.contentWindow.handleOpenVideo()
    } else {
        iframeRef.value.contentWindow.handleCloseVideo()
    }
}, 500)

// 音频开关
const changeAudio = debounce(() => {
    if(!iframeRef.value) return
    if (showAudio.value) {
        iframeRef.value.contentWindow.handleOpenAudio()
    } else {
        iframeRef.value.contentWindow.handleCloseAudio()
    }
}, 500)

// 麦克风开关
const changeMic = debounce(() => {
    if(!iframeRef.value) return
    if (showMic.value) {
        iframeRef.value.contentWindow.openMic()
    } else {
        iframeRef.value.contentWindow.closeMic()
    }
}, 500)

// 扬声器开关
const changeSpeaker = debounce(() => {
    if(!iframeRef.value) return
    if (showSpeaker.value) {
        iframeRef.value.contentWindow.openSpeaker()
    } else {
        iframeRef.value.contentWindow.closeSpeaker()
    }
}, 500)

// 分辨率切换
let preResolution = ''
const changeResolution = debounce((e) => {
    if(!iframeRef.value) return
    iframeRef.value.contentWindow.handleChangeRes(e)
}, 500)
watch(() => resolution.value, (newVal, oldVal) => {
    preResolution = oldVal
    console.log(preResolution)
})
//画面适配
const changeFitMode = debounce(() => {
  if(!iframeRef.value) return
  iframeRef.value.contentWindow.setVideoFitMode(fitMode.value)
}, 300)
// 发送数据
const sendData = debounce(() => {
    if(!iframeRef.value) return
    iframeRef.value.contentWindow.sendDataChannel(sendDataText.value)
}, 500)

//配网逻辑
//1.打开wifi配置区域时，获取实时wifi列表
watch(() => showWifiArea.value, (newVal, oldVal) => {
    if(newVal){
        if(iframeRef.value){
            iframeRef.value.contentWindow.handleUpdateWifiList()
        }
    }else{
        wifiName.value = ''
        wifiPwd.value = ''
    }
})
//2.选择WiFi
const selectWifi = (item) => {
  if(item.connected) return
  wifiName.value = item.name
}
//3.连接wifi
const connectWifi = () => {
    if(!wifiName.value){
        ElMessage.warning('请输入WiFi名称')
        return
    }
    if(iframeRef.value){
        let wifi = {
            name: wifiName.value,
            password: wifiPwd.value
        }
        iframeRef.value.contentWindow.handleWiFiConnect(wifi)
    }
}


</script>

<style lang="scss" scoped>
.app-wrap {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #ffffff;
}
.page {
  width: 100%;
  height: 100%;
}

/* 登录 & 设置卡片 */
.card {
  margin: 12vh 1.2rem;
  background: #fff;
  border-radius: 12px;
  padding: 30px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  h3 {
    font-size: 20px;
    text-align: center;
    margin-bottom: 24px;
    font-weight: 500;
  }
}
.btn-row {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* 悬浮控制面板 */
.control-float {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-panel {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-line {
  align-items: center;
  font-size: 14px;
  white-space: nowrap;
  .device-info {
    display: flex;
    justify-content: space-between;
    .id-tag {
      color: #1677ff;
      font-weight: 500;
      .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #f53f3f;
        margin-right: 6px;
        vertical-align: middle;
      }
      .status-dot.online {
        background-color: #00b42a;
      }
      i {
        margin-left: 5px;
        color: rgb(68 191 252);
        font-size: 15px;
        cursor: pointer;
        //动态切换颜色
        transition: color 0.3s ease-in-out;
        &:hover {
          color: #000cb4;
        }
      }
    }
    .version-tag {
      color: #5a80cd;
      font-size: 13px;
      cursor: pointer;
    }
  }
  .device-btn-row {
    display: flex;
    text-align: left;
    margin-top: 0.5rem;
  }
  
}

.batch-row {
  padding-top: 4px;
  .switch-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    width: 100%;
    border-block: 1px solid #c1baba;
    .switch-item {
        display: flex;
        align-items: center;
        gap: 8px;
        .switch-label {
            font-size: 14px;
            font-weight: 500;
        }
    }
  }
  .resolution-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #c1baba;
    .resolution-label {
        font-size: 14px;
        font-weight: 500;
    }
    .el-select {
        width: 12rem;
    }
    
  }
  .fit-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #c1baba;
    .fit-label {
      font-size: 14px;
      font-weight: 500;
    }
    .el-select {
      width: 12rem;
    }
  }
  .data-send-item {
    margin-top: 8px;
    .data-send-label {
        font-size: 14px;
        font-weight: 500;
        text-align: left;
        margin-bottom: 6px;
    }
    .data-send-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        .input-data {
            flex: 1;
        }
    }
    .data-log {
        margin-top: 6px;
        height: 100px;
        width: 100%;
        background: #f9f9f9;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        overflow-y: auto;
        &.empty {
            height: 20px;
        }
        .no-data-log {
            color: #999;
            text-align: center;
        }
        .log-item {
            text-align: left;
            padding-left: 4px;
            word-break: break-word;
        }
    }
  }
}

/* 折叠动画 */
.fold-enter-active,
.fold-leave-active {
  transition: all 0.25s ease;
}
.fold-enter-from,
.fold-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 单个视频容器 */
.video-container {
  width: 100%;
  height: 100%;
  background: #000;
}
.video-box {
  width: 100%;
  height: 100%;
}
.iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
}
/* ====== WiFi 配网页面样式 ====== */
.wifi-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  .wifi-card {
    width: 90%;
    max-width: 420px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    overflow: hidden;
    max-height: 80vh;
    display: flex;
    flex-direction: column;

    .wifi-header {
      padding: 14px 16px;
      background: #f5f7fa;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e4e7ed;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
    }

    .wifi-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;

      .wifi-list-box {
        border: 1px solid #e4e7ed;
        border-radius: 8px;
        overflow: hidden;

        .wifi-list-header {
          background: #fafbfc;
          padding: 8px 12px;
          font-size: 13px;
          color: #666;
          border-bottom: 1px solid #e4e7ed;
        }

        .wifi-list {
          max-height: 220px;
          overflow-y: auto;

          .wifi-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            border-bottom: 1px solid #f2f3f5;

            &:last-child {
              border-bottom: none;
            }

            .wifi-name {
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 14px;

              i {
                color: #666;
                font-size: 12px;
              }
            }

            .wifi-status {
              font-size: 12px;
              color: #999;
              padding: 2px 6px;
              border-radius: 3px;
              background: #f5f7fa;

              &.connected {
                color: #fff;
                background: #00b42a;
              }
            }
          }

          .no-wifi {
            text-align: center;
            padding: 20px 0;
            color: #999;
            font-size: 13px;
          }
        }
      }

      .wifi-form {
        border: 1px solid #e4e7ed;
        border-radius: 8px;
        padding: 12px;
      }
    }
  }
}
/* 日志弹窗 */
.log-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.4);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  .log-card {
    width: 92%;
    max-width: 700px;
    height: 70vh;
    background: #fff;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    .log-header {
      padding: 14px 16px;
      background: #f5f7fa;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e4e7ed;
      h3 {margin:0; font-size:16px; font-weight:500;}
      .log-btns {display: flex; gap:8px;}
    }
    .log-content {
      flex: 1;
      padding: 12px;
      background: #111;
      background-clip: content-box;
      color: #0f0;
      font-family: Consolas,monospace;
      font-size: 12px;
      overflow-y: auto;
      /* padding区域白色 */
      box-shadow: inset 0 0 0 12px #fff;
      .log-line {
        line-height: 1.6;
        text-align: left;
        word-break: break-all;
      }
      .log-empty {
        color: #999;
        text-align: center;
        padding-top: 30px;
      }
    }
  }
}
</style>