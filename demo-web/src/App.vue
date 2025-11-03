<template>
  <h1 id="app">Connection Registration Demo Web App</h1>
  <UserRegistration />
</template>

<script>
import UserRegistration from './components/UserRegistration.vue'

export default {
  name: 'App',
  components: {
    UserRegistration
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
