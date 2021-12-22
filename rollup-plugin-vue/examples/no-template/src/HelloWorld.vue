/* 使用render函数 */
<script>
import { h } from 'vue'

export default {
  props: ['name'],
  render() {
    return h('div', 'my render')
  },
}
</script>
