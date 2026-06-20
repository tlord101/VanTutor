import os
import math
from PIL import Image, ImageDraw

def generate_icons(source_icon_path, res_dir):
    icon_sizes = {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192
    }
    
    img = Image.open(source_icon_path).convert("RGBA")
    
    for density, size in icon_sizes.items():
        # Add 20% padding around the content
        content_size = int(size * 0.75) 
        padding = (size - content_size) // 2
        
        resized_content = img.resize((content_size, content_size), Image.Resampling.LANCZOS)
        
        # Create a blank transparent canvas
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(resized_content, (padding, padding), resized_content)
        
        out_dir = os.path.join(res_dir, f'mipmap-{density}')
        os.makedirs(out_dir, exist_ok=True)
        
        # Save standard and round launcher icons
        canvas.save(os.path.join(out_dir, 'ic_launcher.png'))
        canvas.save(os.path.join(out_dir, 'ic_launcher_round.png'))
        canvas.save(os.path.join(out_dir, 'ic_launcher_foreground.png'))
        print(f"Generated icon for {density} ({size}x{size})")

def generate_splash(source_icon_path, source_splash_path, res_dir):
    splash_sizes = {
        'drawable-port-mdpi': (320, 480),
        'drawable-port-hdpi': (480, 800),
        'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600),
        'drawable-port-xxxhdpi': (1280, 1920),
        'drawable': (1280, 1920) # Default fallback
    }
    
    icon_img = Image.open(source_icon_path).convert("RGBA")
    banner_img = Image.open(source_splash_path).convert("RGBA")
    
    for density_dir, (width, height) in splash_sizes.items():
        # Create gradient background
        canvas = Image.new("RGBA", (width, height))
        draw = ImageDraw.Draw(canvas)
        
        # Dark blue gradient
        color_top = (0, 20, 50, 255)
        color_bottom = (0, 45, 98, 255)
        for y in range(height):
            r = int(color_top[0] + (color_bottom[0] - color_top[0]) * y / height)
            g = int(color_top[1] + (color_bottom[1] - color_top[1]) * y / height)
            b = int(color_top[2] + (color_bottom[2] - color_top[2]) * y / height)
            draw.line([(0, y), (width, y)], fill=(r, g, b, 255))
        
        # Draw some subtle geometric patterns (overlapping circles)
        draw.ellipse([(-width//2, height//2), (width, height*1.5)], outline=(255, 255, 255, 10), width=width//80)
        draw.ellipse([(width//4, -width//4), (width*1.5, width)], outline=(255, 255, 255, 10), width=width//100)
        
        # Place Center Icon
        icon_target_size = int(width * 0.4)
        resized_icon = icon_img.resize((icon_target_size, icon_target_size), Image.Resampling.LANCZOS)
        icon_x = (width - icon_target_size) // 2
        icon_y = (height - icon_target_size) // 2 - int(height * 0.05) # slightly above center
        canvas.paste(resized_icon, (icon_x, icon_y), resized_icon)
        
        # Place Banner at the bottom
        banner_w, banner_h = banner_img.size
        # scale banner to 60% of screen width
        target_banner_w = int(width * 0.6)
        target_banner_h = int(banner_h * (target_banner_w / banner_w))
        resized_banner = banner_img.resize((target_banner_w, target_banner_h), Image.Resampling.LANCZOS)
        
        banner_x = (width - target_banner_w) // 2
        banner_y = height - target_banner_h - int(height * 0.08) # 8% from bottom margin
        canvas.paste(resized_banner, (banner_x, banner_y), resized_banner)
        
        out_dir = os.path.join(res_dir, density_dir)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, 'splash.png')
        canvas.save(out_path)
        print(f"Generated splash for {density_dir} ({width}x{height})")

if __name__ == "__main__":
    icon_path = "../assets/icon.png"
    splash_path = "../assets/splash.png"
    res_dir = "../android/app/src/main/res"
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(current_dir)
    
    print("Generating icons...")
    generate_icons(icon_path, res_dir)
    print("Generating splash screens...")
    generate_splash(icon_path, splash_path, res_dir)
    print("Done!")
