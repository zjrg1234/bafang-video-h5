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
          <el-form-item label="摄像头 1 ID">
            <el-input v-model="tempDeviceId1" placeholder="请输入" />
          </el-form-item>
          <el-form-item label="摄像头 2 ID">
            <el-input v-model="tempDeviceId2" placeholder="请输入" />
          </el-form-item>
          <el-form-item class="btn-row">
            <el-button @click="goBackLogin">退出登录</el-button>
            <el-button type="primary" @click="goToVideo">进入播放</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 步骤3：视频播放页 -->
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
              摄像头1：<span class="id-tag">{{ deviceId1 }}</span>
              <el-switch
                v-model="show1"
                :active-value="true"
                :inactive-value="false"
                active-text="打开"
                inactive-text="关闭"
                @change="changeVideo($event,1)"
              />
            </div>
            <div class="device-line">
              摄像头2：<span class="id-tag">{{ deviceId2 }}</span>
              <el-switch
                v-model="show2"
                :active-value="true"
                :inactive-value="false"
                active-text="打开"
                inactive-text="关闭"
                @change="changeVideo($event,2)"
              />
            </div>
            <div class="batch-row">
              <el-button type="primary" size="small" @click="openAll">打开全部</el-button>
              <el-button type="danger" size="small" @click="closeAll">关闭全部</el-button>
              <el-button size="small" @click="goBackSet">返回设置</el-button>
            </div>
          </div>
        </transition>
      </div>

      <!-- 视频区域 -->
      <div class="video-container" :class="{ vertical: isVertical }">
        <div class="video-box">
          <iframe 
            ref="iframe1" 
            :src="videoUrl1" 
            frameborder="0" 
            class="iframe"
            ></iframe>
        </div>
        <div class="video-box">
          <iframe 
            ref="iframe2" 
            :src="videoUrl2" 
            frameborder="0" 
            class="iframe"
            ></iframe>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { encrypt } from '../utils'
import { listAllDevice, login } from '../api'


// 步骤 1登录 2设置 3播放
const currentStep = ref(1)

// 登录
const loginForm = ref({ username: '', password: '' })
const token = ref('')
const loading = ref(false)

// 设备ID
const tempDeviceId1 = ref('1002013')
const tempDeviceId2 = ref('1002016')
const deviceId1 = ref('')
const deviceId2 = ref('')

// 视频
const show1 = ref(false)
const show2 = ref(false)
const videoUrl1 = ref('')
const videoUrl2 = ref('')
const baseUrl = '/'
const iframe1 = ref(null)
const iframe2 = ref(null)

// 折叠控制
const showExpand = ref(true)

// 横竖屏
const isVertical = ref(false)
const checkScreen = () => {
  isVertical.value = innerHeight > innerWidth
}


onMounted(() => {
  const t = localStorage.getItem('video_token')
  if (t) {
    token.value = t
    currentStep.value = 2
  }
  checkScreen()
  window.addEventListener('resize', checkScreen)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreen)
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

// 步骤跳转
const goBackLogin = () => {
  logout()
}
function onReport(e,num) {
  const { code, reportContent } = e.detail
  switch (code) {
    case 300:
      //接收分辨率 TODO
      break
    case 908:
      //设备主机断开或未连接
      ElMessage.error(`${num === 1 ? tempDeviceId1.value : tempDeviceId2.value}：${reportContent}`)
      break
    case 909:
      //展示设备连接状态
      break
    case 910:
      //接收接口调用结果
      const {method,ret,state} = JSON.parse(reportContent)
      //封装处理接口调用结果
      handleMethodCallback(method,ret,state,num)
      break
    default:
      //其他上报
      break
  }
}
//处理接口调用结果
const handleMethodCallback = (method,ret,state,num) => {
  switch (method) {
    case 'handleOpenVideo':
      if(ret){
        show1.value = num === 1 ? true : show1.value
        show2.value = num === 2 ? true : show2.value
      }else{
        ElMessage.error(`窗口${num}：${state}`)
      }
      break
    case 'handleCloseVideo':
      if(ret){
        show1.value = num === 1 ? false : show1.value
        show2.value = num === 2 ? false : show2.value
      }
      else{
        ElMessage.error(`窗口${num}：${state}`)
      }
      break
    default:
      break
  }
}
const goToVideo = async () => {
  if (!tempDeviceId1.value || !tempDeviceId2.value) {
    ElMessage.warning('请输入两个设备ID')
    return
  }
  deviceId1.value = tempDeviceId1.value
  deviceId2.value = tempDeviceId2.value
  videoUrl1.value = `${baseUrl}?device_id=${deviceId1.value}&token=${token.value}`
  videoUrl2.value = `${baseUrl}?device_id=${deviceId2.value}&token=${token.value}`
  currentStep.value = 3
   // 等待 DOM 渲染完成！！！
  await nextTick()
  // 视频播放
  iframe1.value.contentWindow.addEventListener('nativeReport', (e) => {
    onReport(e,1)
  });
  iframe2.value.contentWindow.addEventListener('nativeReport', (e) => {
    onReport(e,2)
  });
}

const goBackSet = () => {
  closeAll()
  currentStep.value = 2
}

// 视频切换
const changeVideo = (e,num) => {
  if (e) {
    openVideo(num)
  } else {
    closeVideo(num)
  }
}

// 视频控制
const openVideo = (num) => {
  if (num === 1) {
    if(iframe1.value){
      iframe1.value.contentWindow.handleOpenVideo()
      show1.value = true
    }
  }
  if (num === 2) {
    if(iframe2.value){
      iframe2.value.contentWindow.handleOpenVideo()
      show2.value = true
    }
  }
}
const closeVideo = (num) => {
  if (num === 1) {
    if(iframe1.value){
      iframe1.value.contentWindow.handleCloseVideo()
    }
    show1.value = false
  }
  if (num === 2) {
    if(iframe2.value){
      iframe2.value.contentWindow.handleCloseVideo()
    }
    show2.value = false
  }
}
const openAll = () => {
  openVideo(1)
  openVideo(2)
}
const closeAll = () => {
  closeVideo(1)
  closeVideo(2)
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  white-space: nowrap;
  .id-tag {
    color: #1677ff;
    font-weight: 500;
  }
}

.batch-row {
  display: flex;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid #eee;
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

/* 视频容器 */
.video-container {
  width: 100%;
  height: 100%;
  display: flex;
  gap: 2px;
  background: #000;
  &.vertical {
    flex-direction: column;
  }
}
.video-box {
  flex: 1;
  height: 100%;
}
.iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
}
</style>