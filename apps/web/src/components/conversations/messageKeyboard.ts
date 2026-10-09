export function submitMessageOnEnter(
  event: KeyboardEvent,
  submit: () => void,
): void {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.isComposing ||
    // Some IMEs report confirmation after compositionend, with keyCode 229.
    event.keyCode === 229
  )
    return;

  event.preventDefault();
  if (!event.repeat) submit();
}
