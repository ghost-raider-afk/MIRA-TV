export function russianCountForm(value, forms) {
  const count = Math.abs(Number(value) || 0);
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function formatRussianCount(value, forms) {
  const count = Number(value) || 0;
  return `${count} ${russianCountForm(count, forms)}`;
}
