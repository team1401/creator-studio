document.querySelector("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = e.target.querySelector("button");
  b.disabled = true;
  const error = document.querySelector("#error");
  error.textContent = "";
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: e.target.password.value }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    location.href = "/";
  } catch (e) {
    error.textContent = e.message;
  } finally {
    b.disabled = false;
  }
});
