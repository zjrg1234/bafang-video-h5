<template>
    <div class="wifi-container" v-loading="conectingLoading" :element-loading-text="`连接${wifiName}中...请稍候..`">
        <div class="header">
            <h1 class="title">WiFi 列表</h1>
            <button class="close-btn" @click="$emit('close')">
                <i class="fa fa-times"></i>
            </button>
        </div>
        
        <div class="content">
            <div v-if="isWifiLoading" style="display: flex; justify-content: center; align-items: center; height: 100%;">
                加载中...
            </div>
            <ul v-if="wifiList.length !== 0" class="wifi-list">
                <li v-for="(wifi, index) in wifiList" :key="index">
                    <div class="wifi-icon">
                        <img v-if="wifi.rssi == 4" src="../assets/wifi4.png" alt="WiFi信号图标" class="wifi-img">
                        <img v-else-if="wifi.rssi == 3" src="../assets/wifi3.png" alt="WiFi信号图标" class="wifi-img">
                        <img v-else-if="wifi.rssi == 2" src="../assets/wifi2.png" alt="WiFi信号图标" class="wifi-img">
                        <img v-else src="../assets/wifi1.png" alt="WiFi信号图标" class="wifi-img">
                    </div>
                    <div class="wifi-info">
                        <div class="wifi-name">{{ wifi.name }}</div>
                    </div>
                    <div class="signal-bar">
                        <div v-if="wifi.connected == 1" style="color: skyblue;">已连接</div>
                        <div v-else style="color: green;cursor: pointer;" 
                        @click="selectWifi(index, wifi.name)">连接</div>
                    </div>
                </li>
            </ul>
            <p v-else style="color: gray;">暂无数据</p>
        </div>
    </div>
    <!-- 连接对话框 -->
    <el-dialog
        v-model="dialogVisible"
        title="WiFi配置与连接"
        width="80%"
    >
        <div>
        <p style="text-align: left;">WiFi名称：{{ wifiName }}</p>
        <div style="display: flex; align-items: center; ">
            <p>WiFi密码：</p>
            <el-input
            placeholder="请输入WIFI密码"
            type="password"
            v-model="wifiPassword"
            style="
                flex: 1;
                max-width: 10rem;
                border-radius: 4px;
            "
            show-password
            />
        </div>
        <p>请确保输入的WiFi密码正确，否则可能无法连接到WiFi网络。</p>
        </div>
        <template #footer>
        <div class="dialog-footer">
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" @click="onWiFiConnect">连接</el-button>
        </div>
        </template>
    </el-dialog>
</template>

<script setup>
import { getCurrentInstance, watch } from 'vue';
const { proxy } = getCurrentInstance();
import { onMounted, onUnmounted, ref } from 'vue';
const emit = defineEmits(['close','onWiFiConnect','startUpdateWifiList','clearUpdateTimer']);
const props = defineProps({
    wifiList: {
        type: Array,
        default: () => []
    },
    isWifiLoading:{
        type: Boolean,
        default: () => false
    },
    conectingLoading:{
        type: Boolean,
        default: () => false
    }
});
// 连接对话框
const dialogVisible = ref(false);
const wifiName = ref('');
const wifiPassword = ref('');
const selectWifi = (index, name) => {
  wifiName.value = name;
  dialogVisible.value = true;
}
watch(() => dialogVisible.value, (newVal) => {
    if(newVal){
        emit("clearUpdateTimer")
    }else{
        emit("startUpdateWifiList")
        wifiPassword.value = "";
    }
})
const onWiFiConnect = () => {
    if (!wifiName.value) {
    proxy.$Message.warning("请选择要连接的WiFi");
    return;
  }
  dialogVisible.value = false;
  emit("onWiFiConnect", {
    name: wifiName.value,
    password: wifiPassword.value,
  });
  // 清空密码
  wifiPassword.value = "";
}
onMounted(() => {
  console.log("wifiList", props.wifiList);
  emit("startUpdateWifiList")
})
onUnmounted(() => {
  emit("clearUpdateTimer")
})
</script>

<style lang="scss" scoped>
@use 'sass:math';

.wifi-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,245,245,0.95) 100%);
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        
        .title {
            font-size: 24px;
            font-weight: 600;
            color: #333;
            margin: 0;
        }
        
        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            color: #888;
            cursor: pointer;
            transition: color 0.3s;
            padding: 0;
            
            &:hover {
                color: #f44336;
            }
        }
    }
    
    .content {
        flex: 1;
        overflow: auto;
    }
    
    .wifi-list {
        list-style: none;
        padding: 0;
        margin: 0;
        
        li {
            display: flex;
            align-items: center;
            padding: 16px;
            margin-bottom: 15px;
            border-radius: 12px;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12); // 增大模糊半径和透明度，让阴影更明显
            transition: transform 0.3s, box-shadow 0.3s;
            
            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0,0,0,0.1);
            }
            
            .wifi-icon {
                width: 40px;
                height: 40px;
                margin-right: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                
                .wifi-img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                }
            }
            
            .wifi-info {
                flex: 1;
                min-width: 0;
                
                .wifi-name {
                    font-size: 1rem;
                    font-weight: 500;
                    color: #333;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }
                
                .wifi-strength {
                    font-size: 14px;
                    color: #888;
                }
            }
        }
    }
}    
</style>    