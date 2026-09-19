import { NextResponse } from "next/server";

// อ่านค่าจาก Environment Variables ฝั่ง Server (ไม่มี NEXT_PUBLIC_ จึงไม่หลุดไปที่เบราว์เซอร์)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// เกณฑ์แจ้งเตือนสต๊อกใกล้หมด (เหลือน้อยกว่าหรือเท่ากับค่านี้)
const LOW_STOCK_THRESHOLD = 5;

// escape อักขระพิเศษ กัน parse_mode HTML error
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ส่งข้อความเข้า Telegram — คืนค่า true/false
async function sendTelegramMessage(messageText) {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messageText,
          parse_mode: "HTML",
        }),
      }
    );

    if (!res.ok) {
      console.error("Telegram API error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram fetch failed:", err);
    return false;
  }
}

export async function POST(request) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return NextResponse.json(
      { ok: false, error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN หรือ TELEGRAM_CHAT_ID" },
      { status: 500 }
    );
  }

  // อ่านและตรวจสอบข้อมูลที่ส่งมาจากหน้าขายสินค้า
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const { productName, quantity, totalPrice, stockAfter } = body || {};
  const qty = Number(quantity);
  const total = Number(totalPrice);
  const stock = Number(stockAfter);

  if (
    typeof productName !== "string" ||
    !productName.trim() ||
    !Number.isFinite(qty) ||
    !Number.isFinite(total) ||
    !Number.isFinite(stock)
  ) {
    return NextResponse.json({ ok: false, error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง" }, { status: 400 });
  }

  const name = escapeHtml(productName.trim());

  const time = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const totalText = total.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // งานที่ 1: แจ้งเตือน Order ใหม่
  const orderMessage = [
    "🛍️ <b>มีรายการขายใหม่!</b>",
    `- สินค้า: ${name}`,
    `- จำนวน: ${qty} ชิ้น`,
    `- ราคารวม: ${totalText} บาท`,
    `- สต๊อกคงเหลือปัจจุบัน: ${stock} ชิ้น`,
    `- เวลา: ${time}`,
  ].join("\n");

  const orderSent = await sendTelegramMessage(orderMessage);

  // งานที่ 2: แจ้งเตือนสต๊อกใกล้หมด
  let lowStockSent = null;
  if (stock <= LOW_STOCK_THRESHOLD) {
    const lowStockMessage = [
      "🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>",
      `- สินค้า: ${name}`,
      `- คงเหลือเพียง: ${stock} ชิ้น`,
      "⚠️ กรุณาเติมสต๊อกสินค้าด่วน!",
    ].join("\n");

    lowStockSent = await sendTelegramMessage(lowStockMessage);
  }

  const ok = orderSent && lowStockSent !== false;
  return NextResponse.json({ ok, orderSent, lowStockSent }, { status: ok ? 200 : 502 });
}
