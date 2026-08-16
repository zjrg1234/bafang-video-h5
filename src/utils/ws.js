var lockReconnect = false;
let isReconnecting = false;
let timer = null;
let isNeedConnect = false;
let cached_peer_id = null;
let cached_token = null;
//全局标记，避免重复创建轮询定时器
let hasPollTimer = false;

function InitWebSocket(peer_id, token, callback) {
    // 1. 局部 socket
    let socket = null;
    cached_peer_id = peer_id;
    cached_token = token;
    if (socket) return;

    // 2. 清理方法移到内部，访问局部 socket
    const clean_old_connection = () => {
        if (socket) {
            socket.close();
            socket.onopen = null;
            socket.onclose = null;
            socket.onerror = null;
            socket.onmessage = null;
            if ([WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) {
                socket.close();
            }
            socket = null;
        }
    };
    // 3. 抽离初始化连接方法（重连时调用，不新建实例）
    const initConnect = () => {
        socket = new WebSocket(`${import.meta.env.VITE_WS_BASE_URL}/?peer_id=${peer_id}&type=app&token=${token}`);
        
        socket.onopen = function () {
            lockReconnect = false;
            isReconnecting = false;
            callback({event:'socket_open'});
        };

        socket.onclose = function (e) {
            callback({event:'socket_close'});
            if (isReconnecting) return;
            clean_old_connection();
            console.log('WebSocket 连接关闭', e);
            isReconnecting = true;
            setTimeout(() => {
                isReconnecting = false;
                initConnect(); // 重连调用内部方法
            }, 3000);
        };

        socket.onerror = function (e) {
            callback({event:'socket_error'});
            console.error('WebSocket 连接错误', e);
            clean_old_connection();
            isReconnecting = true;
            setTimeout(() => {
                isReconnecting = false;
                initConnect(); // 重连调用内部方法
            }, 3000);
        };

        socket.onmessage = function (e) {
            var json = JSON.parse(e.data);
            if (json.event === 'ping') {
                if (timer) {
                    clearTimeout(timer);
                }
                timer = setTimeout(() => {
                    isNeedConnect = true;
                    socket.close();
                    socket = null;
                }, 10000);
                socket.send(JSON.stringify({ event: 'pong' }));
            }
            callback(json);
        };
    };

    // 4. 全局唯一轮询定时器
    if (!hasPollTimer) {
        hasPollTimer = true;
        setInterval(() => {
            if (isNeedConnect) {
                initConnect();
                isNeedConnect = false;
            }
        }, 1000);
    }

    // 5. 挂载 send 方法（和同事一致）
    this.send = (data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        }
    };

    // 初始化连接
    initConnect();
};

export default InitWebSocket;