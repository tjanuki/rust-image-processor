use wasm_bindgen::prelude::*;
use web_sys::{ImageData, CanvasRenderingContext2d};
use image::{ImageBuffer, Rgba};

#[wasm_bindgen]
pub fn apply_grayscale(
    ctx: &CanvasRenderingContext2d,
    width: u32,
    height: u32,
    image_data: Vec<u8>
) -> Result<(), JsValue> {
    // Convert raw image data into Image buffer with explicit type Rgba<u8>
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(width, height, image_data)
        .expect("Failed to create image buffer");

    // Create a new buffer for the processed image
    let mut processed: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(width, height);

    // Apply grayscale effect
    for (x, y, pixel) in img.enumerate_pixels() {
        let gray = (
            (pixel[0] as f32 * 0.299) +
            (pixel[1] as f32 * 0.587) +
            (pixel[2] as f32 * 0.114)
        ) as u8;

        processed.put_pixel(x, y, Rgba([gray, gray, gray, pixel[3]]));
    }

    // Convert back to ImageData for canvas
    let processed_data = ImageData::new_with_u8_clamped_array_and_sh(
        wasm_bindgen::Clamped(&processed.into_raw()),
        width,
        height
    )?;

    // Put the processed image onto the canvas
    ctx.put_image_data(&processed_data, 0.0, 0.0)?;

    Ok(())
}