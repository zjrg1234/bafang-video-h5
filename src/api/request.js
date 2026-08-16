import axios from 'axios';

// 创建实例
const service = axios.create({
  baseURL: '/api', // 基础URL
  timeout: 5000,                        // 请求超时时间
  headers: { 'Content-Type': 'application/json' }
});

// 请求拦截器
service.interceptors.request.use(
  config => { 
    // 添加认证token
    const token = localStorage.getItem('video_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  error => Promise.reject(error)
);

// 响应拦截器
service.interceptors.response.use(
  response => {
    const data = response.data;
    return data;
  },
  error => {
    return Promise.reject(error);
  }
);


export default service;