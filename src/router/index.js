import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/Home.vue";
import Double from "../views/Double.vue";
import Demo from "../views/Demo.vue";

//定义路由
const routes = [
    {
        path:'/',
        component:Home
    },
    {
        path:'/double',
        component:Double
    },
    {
        path:'/demo',
        component:Demo
    }
]

//创建路由实例
const router = createRouter({
    history:createWebHistory(),
    routes
})

export default router