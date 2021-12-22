/* 带template简单模板 */
<script>
export default {
  props: ['name'],
}
</script>

<template>
  <div>Hello {{ name }}!</div>
</template>
