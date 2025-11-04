<template>
  <div id="app-container"> <h1>Connection 链上应用演示</h1>
    <ConnectionApp />
  </div>
</template>

<script>
import ConnectionApp from './components/ConnectionApp.vue'

export default {
  name: 'App',
  components: {
    ConnectionApp 
  }
}
</script>

<style>
/* 🚨 将 #app 样式改为 #app-container */
#app-container {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
/* 调整主标题的样式 */
#app-container h1 {
    color: #303133;
    font-size: 1.8em;
    margin-bottom: 25px;
}
</style>