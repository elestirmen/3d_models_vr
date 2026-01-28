#!/bin/bash

folders=("a_b_blok" "c_blok" "d_blok" "e_blok" "f_blok" "ilahiyat" "kutuphane" "oku_genel_plan" "rektorluk")
main_index="/var/www/html/index.html"

cat > "$main_index" <<EOF
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>3D Model Giriş Sayfası</title>
  <style>
    body {
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #e0eafc, #cfdef3);
      color: #333;
      padding: 20px;
    }
    h1 {
      text-align: center;
      margin-bottom: 40px;
      font-size: 32px;
      color: #2c3e50;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      text-align: center;
      padding: 30px 20px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 16px rgba(0,0,0,0.2);
    }
    .card a {
      text-decoration: none;
      color: #007bff;
      font-size: 20px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>📌 3D Model Galerisi</h1>
  <div class="grid">
EOF

for folder in "${folders[@]}"
do
  display_name=$(echo "$folder" | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g')

  cat >> "$main_index" <<EOF
    <div class="card">
      <a href="/$folder/">$display_name</a>
    </div>
EOF
done

cat >> "$main_index" <<EOF
  </div>
</body>
</html>
EOF

echo "✅ Şık ana sayfa oluşturuldu: $main_index"
