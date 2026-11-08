// Runtime helpers over the rig's part contract (rig.ts header). DOM only.

const show = (root: Element, part: string, variant: string) => {
  root.querySelectorAll<SVGElement>(`[data-part="${part}"]`).forEach((node) => {
    node.style.display = node.dataset.v === variant ? '' : 'none'
  })
}

export const setExpression = (root: Element, expression: string) => {
  show(root, 'brow', expression)
  show(root, 'mouth', expression)
}
export const setEyes = (root: Element, open: boolean) => show(root, 'eye', open ? 'open' : 'closed')
export const setMouth = (root: Element, variant: string) => show(root, 'mouth', variant)
