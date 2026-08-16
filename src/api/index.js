import request from './request';

export function login(data) {
  return request({
    url: '/login',
    method: 'post',
    data
  });
}
// 获取所有可查看设备
export function listAllDevice(data) {
  return request({
    url: '/user/device/listAll',
    method: 'post',
    data
  });
}
// 获取设备详情
export function getDeviceInfo(data) {
  return request({
    url: '/device/getInfo',
    method: 'post',
    data
  });
}
//检查设备更新
export function checkDeviceUpdate(data) {
  return request({
    url: '/deviceModel/findLatestFirmware',
    method: 'post',
    data
  });
}
