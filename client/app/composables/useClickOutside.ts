/**
 * 点击元素外部时触发回调。用于关闭下拉菜单、移动端抽屉等。
 *
 * 细节：监听用 `pointerdown` 而不是 `click`。
 * 用 click 的话，点外部时浏览器会先触发 mousedown/mouseup，
 * 如果被点的那个元素自己也有 click 处理（比如另一颗按钮），
 * 关闭动作和它的动作会在同一次点击里竞争，表现为「点 A 却先关了 B 再触发 A」的怪现象。
 * pointerdown 更早、语义更贴近「用户想离开这里」。
 */
export function useClickOutside(
  target: Ref<HTMLElement | null | undefined> | (() => HTMLElement | null | undefined),
  handler: () => void,
) {
  const getEl = typeof target === 'function' ? target : () => target.value;

  function onPointerDown(e: PointerEvent) {
    const el = getEl();
    if (!el) return;
    const path = e.composedPath?.() ?? [];
    if (path.includes(el)) return;
    handler();
  }

  onMounted(() => document.addEventListener('pointerdown', onPointerDown, true));
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true));
}
