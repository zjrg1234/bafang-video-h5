const aseKey = 'xyv8isi9on888888'
import CryptoJS from 'crypto-js'
export function encrypt(message) {
  return CryptoJS.AES.encrypt(message, CryptoJS.enc.Utf8.parse(aseKey), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString()
}
export const getLocalTime = (flag = 0) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 补零成2位
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0'); // 补零成3位毫秒
  // 最终格式：2026/01/07 10:48:22.804
  if(flag === 1) {
    return `${year}/${month}/${day} ${hour}:${minute}`;
  }
  return `${hour}:${minute}:${second}.${ms}`;
}