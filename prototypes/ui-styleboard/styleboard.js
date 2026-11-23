const toast = document.querySelector(".toast");
let toastTimer;

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

document.querySelectorAll("[data-toast]").forEach((element) => {
  element.addEventListener("click", (event) => {
    event.preventDefault();
    showToast(element.dataset.toast);
  });
});

document.querySelectorAll(".navigation button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".navigation button").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    showToast(`${button.textContent.trim()} · 入口状态预览`);
  });
});

