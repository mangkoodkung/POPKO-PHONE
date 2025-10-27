console.log("🌈 POPKO-PHONE Extension Loaded (HTML version)");

window.addEventListener("DOMContentLoaded", () => {
  // 🪄 แสดงข้อความระหว่างโหลด
  const loading = document.createElement("div");
  loading.textContent = "📱 กำลังเปิด POPKO-PHONE...";
  loading.style.cssText = `
    font-family: 'Prompt', sans-serif;
    color: #fff;
    background: linear-gradient(135deg, #ff9ae1, #c28cff);
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    z-index: 9999;
  `;
  document.body.appendChild(loading);

  // 🧱 สร้าง iframe สำหรับ HTML หลัก
  const iframe = document.createElement("iframe");
  iframe.src = "./POPKO-PHONE.html?t=" + Date.now(); // ป้องกัน cache
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: #000;
  `;
  iframe.onload = () => {
    console.log("✅ POPKO-PHONE.html loaded successfully!");
    loading.remove(); // เอาข้อความโหลดออก
  };

  // 🧹 ล้าง body เดิมและฝัง iframe
  document.body.innerHTML = "";
  document.body.appendChild(iframe);
});
