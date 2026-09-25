export function replaceChildrenCompat(node, ...children) {
  if (!node) return;
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren(...children);
    return;
  }

  while (node.firstChild) node.removeChild(node.firstChild);
  for (const child of children) {
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
