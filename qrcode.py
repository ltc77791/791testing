import streamlit as st
import qrcode
from PIL import Image
import io

st.set_page_config(page_title="二维码生成器", page_icon="🔲")

st.title("🔲 备件二维码生成工具")
st.caption("输入备件号，生成对应的二维码用于测试扫码功能")

# 输入区
part_no = st.text_input("请输入备件号", placeholder="例如: BJ-2024-001")

if part_no:
    # 生成逻辑
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(part_no)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # 显示图片
    st.image(img.get_image(), caption=f"内容: {part_no}", width=300)
    
    # 转换为字节流以供下载
    buf = io.BytesIO()
    img.save(buf)
    byte_im = buf.getvalue()
    
    st.download_button(
        label="💾 下载该二维码图片",
        data=byte_im,
        file_name=f"QR_{part_no}.png",
        mime="image/png"
    )
else:
    st.info("请在上方输入内容以生成二维码")

st.divider()
st.markdown("""
**使用说明:**
1. 输入备件号（必须与系统中录入的备件号一致）。
2. 生成后，使用主系统的“扫码查询”功能，对准屏幕上的二维码即可。
""")