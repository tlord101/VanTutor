import os
from PIL import Image, ImageDraw

def generate_squircle_black_icons():
    # 1. Load the authentic un-squeezed source logo (public/logo_icon.png)
    src_path = 'public/logo_icon.png'
    src = Image.open(src_path).convert('RGBA')
    width, height = src.size
    
    # 2. Extract shape & convert blue to pure crisp white
    r, g, b, a = src.split()
    white_logo = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    white_logo.putalpha(a)
    
    bbox = white_logo.getbbox()
    cropped_logo = white_logo.crop(bbox) if bbox else white_logo
    print(f"Authentic logo size: {src.size}, Cropped bbox: {bbox}, Aspect ratio: {cropped_logo.width}/{cropped_logo.height} = {cropped_logo.width/cropped_logo.height:.3f}")

    # Helper function to create squircle black icon
    def create_squircle_icon(size):
        scale = 4
        canvas_size = size * scale
        img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Modern continuous squircle corner radius (~22.5% of total width)
        radius = int(canvas_size * 0.225)
        draw.rounded_rectangle(
            [0, 0, canvas_size - 1, canvas_size - 1],
            radius=radius,
            fill=(0, 0, 0, 255)
        )
        
        # Scale logo to fit comfortably with ~22% margin so it looks spacious and bold
        target_logo_size = int(canvas_size * 0.58)
        
        aspect = cropped_logo.width / cropped_logo.height
        if aspect >= 1:
            lw = target_logo_size
            lh = int(target_logo_size / aspect)
        else:
            lh = target_logo_size
            lw = int(target_logo_size * aspect)
            
        scaled_logo = cropped_logo.resize((lw, lh), Image.Resampling.LANCZOS)
        
        # Center in canvas
        offset_x = (canvas_size - lw) // 2
        offset_y = (canvas_size - lh) // 2
        img.paste(scaled_logo, (offset_x, offset_y), scaled_logo)
        
        return img.resize((size, size), Image.Resampling.LANCZOS)

    # Helper function for foreground icon (for Android adaptive launcher)
    def create_foreground_icon(size):
        scale = 4
        canvas_size = size * scale
        img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        
        target_logo_size = int(canvas_size * 0.52)
        aspect = cropped_logo.width / cropped_logo.height
        if aspect >= 1:
            lw = target_logo_size
            lh = int(target_logo_size / aspect)
        else:
            lh = target_logo_size
            lw = int(target_logo_size * aspect)
            
        scaled_logo = cropped_logo.resize((lw, lh), Image.Resampling.LANCZOS)
        offset_x = (canvas_size - lw) // 2
        offset_y = (canvas_size - lh) // 2
        img.paste(scaled_logo, (offset_x, offset_y), scaled_logo)
        
        return img.resize((size, size), Image.Resampling.LANCZOS)

    # Helper function for notification silhouette icon (Android status bar)
    def create_stat_icon(size):
        scale = 4
        canvas_size = size * scale
        img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        
        target_logo_size = int(canvas_size * 0.80)
        aspect = cropped_logo.width / cropped_logo.height
        if aspect >= 1:
            lw = target_logo_size
            lh = int(target_logo_size / aspect)
        else:
            lh = target_logo_size
            lw = int(target_logo_size * aspect)
            
        scaled_logo = cropped_logo.resize((lw, lh), Image.Resampling.LANCZOS)
        offset_x = (canvas_size - lw) // 2
        offset_y = (canvas_size - lh) // 2
        img.paste(scaled_logo, (offset_x, offset_y), scaled_logo)
        
        return img.resize((size, size), Image.Resampling.LANCZOS)

    # 3. Update all mipmap folders
    mipmap_configs = {
        'android/app/src/main/res/mipmap-mdpi': {'launcher': 48, 'bg': 108, 'fg': 48, 'round': 48},
        'android/app/src/main/res/mipmap-hdpi': {'launcher': 72, 'bg': 162, 'fg': 72, 'round': 72},
        'android/app/src/main/res/mipmap-xhdpi': {'launcher': 96, 'bg': 216, 'fg': 96, 'round': 96},
        'android/app/src/main/res/mipmap-xxhdpi': {'launcher': 144, 'bg': 324, 'fg': 144, 'round': 144},
        'android/app/src/main/res/mipmap-xxxhdpi': {'launcher': 192, 'bg': 432, 'fg': 192, 'round': 192},
        'android/app/src/main/res/mipmap-ldpi': {'launcher': 36, 'bg': 81, 'fg': 81, 'round': 36},
    }

    for folder, dims in mipmap_configs.items():
        if not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)
            
        # Both ic_launcher_round and ic_launcher are now modern squircle black icons
        squircle_icon = create_squircle_icon(dims['round'])
        squircle_icon.save(os.path.join(folder, 'ic_launcher_round.png'), 'PNG')
        squircle_icon.save(os.path.join(folder, 'ic_launcher.png'), 'PNG')
        
        # Adaptive foreground
        fg_icon = create_foreground_icon(dims['fg'])
        fg_icon.save(os.path.join(folder, 'ic_launcher_foreground.png'), 'PNG')
        
        # Adaptive background (pure black)
        bg_icon = Image.new('RGBA', (dims['bg'], dims['bg']), (0, 0, 0, 255))
        bg_icon.save(os.path.join(folder, 'ic_launcher_background.png'), 'PNG')
        
        print(f"Updated squircle icons for {folder}")

    # 4. Update all notification icons in drawable folders
    drawable_configs = {
        'android/app/src/main/res/drawable-mdpi': 24,
        'android/app/src/main/res/drawable-hdpi': 36,
        'android/app/src/main/res/drawable-xhdpi': 48,
        'android/app/src/main/res/drawable-xxhdpi': 72,
        'android/app/src/main/res/drawable-xxxhdpi': 96,
        'android/app/src/main/res/drawable': 96,
    }

    for folder, sz in drawable_configs.items():
        if not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)
        stat_icon = create_stat_icon(sz)
        stat_icon.save(os.path.join(folder, 'ic_stat_name.png'), 'PNG')
        print(f"Updated notification icon for {folder} ({sz}x{sz})")

    # 5. Master high-res Play Store and web assets
    master_squircle = create_squircle_icon(512)
    master_squircle.save('public/logo_icon_black_squircle.png', 'PNG')
    master_squircle.save('public/logo_icon_black_round.png', 'PNG')
    master_squircle.save('public/logo_icon_black.png', 'PNG')

    master_white = create_stat_icon(512)
    master_white.save('public/logo_icon_white.png', 'PNG')

    print("All squircle icons generated with perfect un-squeezed proportions!")

if __name__ == '__main__':
    generate_squircle_black_icons()
