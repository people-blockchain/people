#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const surfacesDir = path.join(import.meta.dirname, '../src/lib/locales/surfaces');
const manualCode = `git clone https://github.com/rednaxelavoroge/Peoples-Blockchain.git
cd Peoples-Blockchain/people-node
npm ci
npm run build
node --env-file=.env.node apps/node/dist/index.js`;

const verifyCode = `curl http://127.0.0.1:4001/health
# {"ok":true,"chainId":"people-public-testnet-v2-2026-09-30",...}
curl http://127.0.0.1:4001/chain/head`;

const patches = {
  en: {
    nodeQuickStart: {
      title: 'Your node — one command',
      intro:
        'Install and start Docker. The command below runs a verifying follower node with persistent storage on the public testnet. No wallet, bond or private keys are required.',
      copy: 'Copy',
      copied: 'Copied',
      copyManual: 'Select the command and copy it manually.',
      hint:
        'Check: curl http://127.0.0.1:4001/health should return ok:true and chainId people-public-testnet-v2-2026-09-30. Logs: docker logs people-node. Stop: docker stop people-node. Start again: docker start people-node. Update image: docker stop people-node && docker rm people-node, then run the command again (keep volume people-node-data).',
    },
    node02:
      'Use the command in the panel above. It is pinned to the current public testnet release. Do not substitute other images or network URLs.',
    manual05:
      'Save .env.node inside people-node in your Peoples-Blockchain checkout and restrict file permissions. Do not enable ALLOW_FAUCET or ALLOW_DEV_ENDPOINTS on an ordinary node. Do not expose the HTTP API to the internet without agreed protection.',
    manual01:
      'Manual builds need repository access and an approved revision. Take CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS and fee parameters from the published v2 network configuration at https://node.peopleblockchain.network/network. Use a separate data directory for a different chain.',
    verifyState:
      'After startup, run the commands below on your computer. /health should return JSON with ok:true. /chain/head shows your local height — compare it with the public explorer. A successful /health alone does not prove full sync. The local API has no login; ignore unrelated 401 errors on other websites.',
  },
  ru: {
    nodeQuickStart: {
      title: 'Своя нода — одна команда',
      intro:
        'Установите и запустите Docker. Команда ниже запускает обычную проверяющую ноду с постоянным хранилищем в публичной тестовой сети. Кошелёк, залог и приватные ключи не нужны.',
      copy: 'Копировать',
      copied: 'Скопировано',
      copyManual: 'Выделите команду и скопируйте вручную.',
      hint:
        'Проверка: curl http://127.0.0.1:4001/health — в ответе ok:true и chainId people-public-testnet-v2-2026-09-30. Логи: docker logs people-node. Остановка: docker stop people-node. Повторный запуск: docker start people-node. Обновление образа: docker stop people-node && docker rm people-node, затем снова выполните команду выше (том people-node-data сохраняет цепочку).',
    },
    node02:
      'Используйте команду в блоке выше. Она закреплена за текущим публичным выпуском тестовой сети. Не подставляйте другие образы или адреса сети.',
    manual05:
      'Сохраните .env.node в каталоге people-node внутри клонированного репозитория Peoples-Blockchain и ограничьте доступ к файлу. Не включайте ALLOW_FAUCET и ALLOW_DEV_ENDPOINTS для обычной ноды. Не публикуйте HTTP API в интернет без согласованной защиты.',
    manual01:
      'Для ручной сборки нужен доступ к репозиторию и согласованная ревизия. Возьмите CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS и тарифы из опубликованной конфигурации v2 на https://node.peopleblockchain.network/network. Для другой сети используйте отдельный каталог данных.',
    verifyState:
      'После запуска выполните команды ниже на своём компьютере. /health должен вернуть JSON с ok:true. /chain/head покажет локальную высоту — сравните её с публичным сканером. Успешный /health сам по себе не доказывает полную синхронизацию. Локальный API без пароля; не путайте с посторонними ошибками 401 на других сайтах.',
  },
  es: {
    nodeQuickStart: {
      title: 'Tu nodo — un comando',
      intro:
        'Instala y arranca Docker. El comando siguiente ejecuta un nodo seguidor verificador con almacenamiento persistente en la testnet pública. No necesitas cartera, fianza ni claves privadas.',
      copy: 'Copiar',
      copied: 'Copiado',
      copyManual: 'Selecciona el comando y cópialo manualmente.',
      hint:
        'Comprueba: curl http://127.0.0.1:4001/health debe devolver ok:true y chainId people-public-testnet-v2-2026-09-30. Registros: docker logs people-node. Parar: docker stop people-node. Reiniciar: docker start people-node. Actualizar imagen: docker stop people-node && docker rm people-node y vuelve a ejecutar el comando (conserva el volumen people-node-data).',
    },
    node02:
      'Usa el comando del panel superior. Está fijado al lanzamiento público actual de la testnet. No sustituyas otras imágenes ni URLs de red.',
    manual05:
      'Guarda .env.node en people-node dentro de tu copia de Peoples-Blockchain y restringe permisos. No actives ALLOW_FAUCET ni ALLOW_DEV_ENDPOINTS en un nodo ordinario. No expongas la API HTTP a Internet sin protección acordada.',
    manual01:
      'La compilación manual requiere acceso al repositorio y una revisión aprobada. Toma CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS y tarifas de la configuración v2 publicada en https://node.peopleblockchain.network/network. Usa otro directorio de datos para otra red.',
    verifyState:
      'Tras el arranque, ejecuta los comandos en tu equipo. /health debe devolver JSON con ok:true. /chain/head muestra tu altura local; compárala con el explorador público. Un /health correcto no prueba sincronización completa. La API local no tiene contraseña; ignora errores 401 ajenos en otros sitios.',
  },
  pt: {
    nodeQuickStart: {
      title: 'O teu nó — um comando',
      intro:
        'Instala e inicia o Docker. O comando abaixo executa um nó seguidor verificador com armazenamento persistente na testnet pública. Não precisas de carteira, caução nem chaves privadas.',
      copy: 'Copiar',
      copied: 'Copiado',
      copyManual: 'Seleciona o comando e copia manualmente.',
      hint:
        'Verificação: curl http://127.0.0.1:4001/health deve devolver ok:true e chainId people-public-testnet-v2-2026-09-30. Registos: docker logs people-node. Parar: docker stop people-node. Reiniciar: docker start people-node. Atualizar imagem: docker stop people-node && docker rm people-node e volta a executar o comando (mantém o volume people-node-data).',
    },
    node02:
      'Usa o comando no painel acima. Está fixado ao lançamento público atual da testnet. Não substituas outras imagens nem URLs de rede.',
    manual05:
      'Guarda .env.node em people-node dentro do teu checkout Peoples-Blockchain e restringe permissões. Não atives ALLOW_FAUCET nem ALLOW_DEV_ENDPOINTS num nó comum. Não exponhas a API HTTP à Internet sem proteção acordada.',
    manual01:
      'Compilação manual requer acesso ao repositório e revisão aprovada. Usa CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS e taxas da configuração v2 em https://node.peopleblockchain.network/network. Usa outro diretório de dados para outra rede.',
    verifyState:
      'Após arranque, executa os comandos no teu computador. /health deve devolver JSON com ok:true. /chain/head mostra a altura local — compara com o explorador público. /health sozinho não prova sincronização completa. A API local não tem senha; ignora erros 401 noutros sites.',
  },
  fr: {
    nodeQuickStart: {
      title: 'Votre nœud — une commande',
      intro:
        'Installez et démarrez Docker. La commande ci-dessous lance un nœud suiveur vérifiant avec stockage persistant sur le testnet public. Aucun portefeuille, dépôt ni clé privée requis.',
      copy: 'Copier',
      copied: 'Copié',
      copyManual: 'Sélectionnez la commande et copiez-la manuellement.',
      hint:
        'Vérification : curl http://127.0.0.1:4001/health doit renvoyer ok:true et chainId people-public-testnet-v2-2026-09-30. Journaux : docker logs people-node. Arrêt : docker stop people-node. Redémarrage : docker start people-node. Mise à jour : docker stop people-node && docker rm people-node puis relancez la commande (conservez le volume people-node-data).',
    },
    node02:
      'Utilisez la commande du panneau ci-dessus. Elle est épinglée à la version publique actuelle du testnet. Ne substituez pas d’autres images ou URL réseau.',
    manual05:
      'Enregistrez .env.node dans people-node de votre copie Peoples-Blockchain et restreignez les permissions. N’activez pas ALLOW_FAUCET ni ALLOW_DEV_ENDPOINTS sur un nœud ordinaire. N’exposez pas l’API HTTP sans protection convenue.',
    manual01:
      'La compilation manuelle exige l’accès au dépôt et une révision approuvée. Reprenez CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS et les frais depuis la config v2 sur https://node.peopleblockchain.network/network. Utilisez un autre répertoire de données pour un autre réseau.',
    verifyState:
      'Après le démarrage, exécutez les commandes sur votre machine. /health doit renvoyer du JSON avec ok:true. /chain/head affiche votre hauteur locale — comparez avec l’explorateur public. Un /health réussi ne prouve pas une synchro complète. L’API locale n’a pas de mot de passe ; ignorez les 401 ailleurs.',
  },
  de: {
    nodeQuickStart: {
      title: 'Ihr Node — ein Befehl',
      intro:
        'Installieren und starten Sie Docker. Der Befehl unten startet einen verifizierenden Follower-Node mit persistentem Speicher im öffentlichen Testnetz. Kein Wallet, keine Kaution, keine privaten Schlüssel nötig.',
      copy: 'Kopieren',
      copied: 'Kopiert',
      copyManual: 'Befehl markieren und manuell kopieren.',
      hint:
        'Prüfen: curl http://127.0.0.1:4001/health sollte ok:true und chainId people-public-testnet-v2-2026-09-30 liefern. Logs: docker logs people-node. Stopp: docker stop people-node. Neu starten: docker start people-node. Image aktualisieren: docker stop people-node && docker rm people-node, dann Befehl erneut (Volume people-node-data behalten).',
    },
    node02:
      'Nutzen Sie den Befehl im Kasten oben. Er ist an die aktuelle öffentliche Testnet-Version gebunden. Keine anderen Images oder Netzwerk-URLs einsetzen.',
    manual05:
      'Speichern Sie .env.node in people-node innerhalb Ihres Peoples-Blockchain-Checkouts und schützen Sie die Datei. ALLOW_FAUCET und ALLOW_DEV_ENDPOINTS auf einem normalen Node nicht aktivieren. HTTP-API nicht ungeschützt ins Internet stellen.',
    manual01:
      'Manueller Build braucht Repository-Zugang und freigegebene Revision. CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS und Gebühren aus der v2-Konfiguration unter https://node.peopleblockchain.network/network übernehmen. Für ein anderes Netz separates DATA_DIR.',
    verifyState:
      'Nach dem Start die Befehle lokal ausführen. /health sollte JSON mit ok:true liefern. /chain/head zeigt die lokale Höhe — mit dem Explorer vergleichen. /health allein beweist keine volle Synchronisation. Lokale API ohne Login; fremde 401-Fehler ignorieren.',
  },
  it: {
    nodeQuickStart: {
      title: 'Il tuo nodo — un comando',
      intro:
        'Installa e avvia Docker. Il comando seguente esegue un nodo follower verificante con archiviazione persistente sulla testnet pubblica. Non servono portafoglio, deposito né chiavi private.',
      copy: 'Copia',
      copied: 'Copiato',
      copyManual: 'Seleziona il comando e copialo manualmente.',
      hint:
        'Verifica: curl http://127.0.0.1:4001/health deve restituire ok:true e chainId people-public-testnet-v2-2026-09-30. Log: docker logs people-node. Stop: docker stop people-node. Riavvio: docker start people-node. Aggiorna immagine: docker stop people-node && docker rm people-node poi ripeti il comando (mantieni il volume people-node-data).',
    },
    node02:
      'Usa il comando nel riquadro sopra. È fissato alla release pubblica attuale della testnet. Non sostituire altre immagini o URL di rete.',
    manual05:
      'Salva .env.node in people-node nel checkout Peoples-Blockchain e limita i permessi. Non abilitare ALLOW_FAUCET né ALLOW_DEV_ENDPOINTS su un nodo ordinario. Non esporre l’API HTTP senza protezione concordata.',
    manual01:
      'La build manuale richiede accesso al repository e revisione approvata. Prendi CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS e tariffe dalla configurazione v2 su https://node.peopleblockchain.network/network. Usa una directory dati separata per un’altra rete.',
    verifyState:
      'Dopo l’avvio esegui i comandi sul tuo computer. /health deve restituire JSON con ok:true. /chain/head mostra l’altezza locale — confrontala con l’explorer pubblico. /health da solo non prova sincronizzazione completa. API locale senza password; ignora 401 su altri siti.',
  },
  tr: {
    nodeQuickStart: {
      title: 'Düğümünüz — tek komut',
      intro:
        'Docker’ı kurun ve çalıştırın. Aşağıdaki komut, genel test ağında kalıcı depolamalı doğrulayan bir takipçi düğümü başlatır. Cüzdan, teminat veya özel anahtar gerekmez.',
      copy: 'Kopyala',
      copied: 'Kopyalandı',
      copyManual: 'Komutu seçip elle kopyalayın.',
      hint:
        'Kontrol: curl http://127.0.0.1:4001/health ok:true ve chainId people-public-testnet-v2-2026-09-30 döndürmeli. Günlükler: docker logs people-node. Durdur: docker stop people-node. Yeniden başlat: docker start people-node. Güncelleme: docker stop people-node && docker rm people-node sonra komutu tekrar çalıştırın (people-node-data hacmini koruyun).',
    },
    node02:
      'Yukarıdaki kutudaki komutu kullanın. Güncel genel testnet sürümüne sabitlenmiştir. Başka görüntü veya ağ adresi kullanmayın.',
    manual05:
      '.env.node dosyasını Peoples-Blockchain kopyanızdaki people-node içinde saklayın ve izinleri kısıtlayın. Normal düğümde ALLOW_FAUCET ve ALLOW_DEV_ENDPOINTS açmayın. HTTP API’yi korumasız internete açmayın.',
    manual01:
      'Manuel derleme için depo erişimi ve onaylı revizyon gerekir. CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS ve ücretleri https://node.peopleblockchain.network/network v2 yapılandırmasından alın. Başka ağ için ayrı veri dizini kullanın.',
    verifyState:
      'Başlangıçtan sonra komutları bilgisayarınızda çalıştırın. /health ok:true içeren JSON döndürmeli. /chain/head yerel yüksekliği gösterir — genel gezginle karşılaştırın. /health tek başına tam senkronu kanıtlamaz. Yerel API parolasız; başka sitelerdeki 401’leri yok sayın.',
  },
  vi: {
    nodeQuickStart: {
      title: 'Nút của bạn — một lệnh',
      intro:
        'Cài và chạy Docker. Lệnh dưới chạy nút follower xác minh với lưu trữ bền trên testnet công khai. Không cần ví, ký quỹ hay khóa riêng.',
      copy: 'Sao chép',
      copied: 'Đã sao chép',
      copyManual: 'Chọn lệnh và sao chép thủ công.',
      hint:
        'Kiểm tra: curl http://127.0.0.1:4001/health trả về ok:true và chainId people-public-testnet-v2-2026-09-30. Nhật ký: docker logs people-node. Dừng: docker stop people-node. Chạy lại: docker start people-node. Cập nhật ảnh: docker stop people-node && docker rm people-node rồi chạy lại lệnh (giữ volume people-node-data).',
    },
    node02:
      'Dùng lệnh trong khung phía trên. Lệnh được ghim bản phát hành testnet công khai hiện tại. Không thay ảnh hoặc URL mạng khác.',
    manual05:
      'Lưu .env.node trong people-node trong bản sao Peoples-Blockchain và giới hạn quyền. Không bật ALLOW_FAUCET hay ALLOW_DEV_ENDPOINTS trên nút thường. Không công khai API HTTP ra internet không bảo vệ.',
    manual01:
      'Build thủ công cần quyền repo và revision đã duyệt. Lấy CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS và phí từ cấu hình v2 tại https://node.peopleblockchain.network/network. Dùng thư mục dữ liệu riêng cho mạng khác.',
    verifyState:
      'Sau khởi động, chạy lệnh trên máy bạn. /health trả JSON ok:true. /chain/head cho chiều cao cục bộ — so với explorer công khai. /health thành công chưa chứng minh đồng bộ đầy đủ. API cục bộ không mật khẩu; bỏ qua lỗi 401 ở site khác.',
  },
  id: {
    nodeQuickStart: {
      title: 'Node Anda — satu perintah',
      intro:
        'Pasang dan jalankan Docker. Perintah di bawah menjalankan node pengikut verifikasi dengan penyimpanan persisten di testnet publik. Tidak perlu dompet, jaminan, atau kunci privat.',
      copy: 'Salin',
      copied: 'Disalin',
      copyManual: 'Pilih perintah dan salin manual.',
      hint:
        'Cek: curl http://127.0.0.1:4001/health harus mengembalikan ok:true dan chainId people-public-testnet-v2-2026-09-30. Log: docker logs people-node. Henti: docker stop people-node. Mulai lagi: docker start people-node. Perbarui image: docker stop people-node && docker rm people-node lalu jalankan perintah lagi (pertahankan volume people-node-data).',
    },
    node02:
      'Gunakan perintah di kotak atas. Terikat ke rilis testnet publik saat ini. Jangan ganti image atau URL jaringan lain.',
    manual05:
      'Simpan .env.node di people-node dalam checkout Peoples-Blockchain Anda dan batasi izin. Jangan aktifkan ALLOW_FAUCET atau ALLOW_DEV_ENDPOINTS pada node biasa. Jangan ekspos API HTTP ke internet tanpa perlindungan.',
    manual01:
      'Build manual memerlukan akses repo dan revisi yang disetujui. Ambil CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS dan biaya dari konfigurasi v2 di https://node.peopleblockchain.network/network. Gunakan direktori data terpisah untuk jaringan lain.',
    verifyState:
      'Setelah mulai, jalankan perintah di komputer Anda. /health harus mengembalikan JSON ok:true. /chain/head menampilkan tinggi lokal — bandingkan dengan explorer publik. /health saja tidak membuktikan sinkron penuh. API lokal tanpa sandi; abaikan 401 di situs lain.',
  },
  zh: {
    nodeQuickStart: {
      title: '你的节点 — 一条命令',
      intro:
        '安装并启动 Docker。下面的命令在公共测试网上运行带持久存储的验证跟随节点。无需钱包、保证金或私钥。',
      copy: '复制',
      copied: '已复制',
      copyManual: '请手动选择并复制命令。',
      hint:
        '检查：curl http://127.0.0.1:4001/health 应返回 ok:true 和 chainId people-public-testnet-v2-2026-09-30。日志：docker logs people-node。停止：docker stop people-node。再次启动：docker start people-node。更新镜像：docker stop people-node && docker rm people-node 后重新运行上述命令（保留卷 people-node-data）。',
    },
    node02: '使用上方框中的命令。它固定为当前公共测试网发布版本。请勿替换其他镜像或网络地址。',
    manual05:
      '将 .env.node 保存在 Peoples-Blockchain 检出目录中的 people-node 内并限制权限。普通节点不要启用 ALLOW_FAUCET 或 ALLOW_DEV_ENDPOINTS。未经约定保护不要将 HTTP API 暴露到公网。',
    manual01:
      '手动构建需要仓库访问权和已批准的修订。从 https://node.peopleblockchain.network/network 的 v2 配置获取 CHAIN_ID、GENESIS_FAUCET_ADDRESS、BOOTSTRAP_ADDRESS、BOOTSTRAP_PEERS 和费用。其他网络请使用单独的数据目录。',
    verifyState:
      '启动后在本机运行下列命令。/health 应返回含 ok:true 的 JSON。/chain/head 显示本地高度 — 与公共浏览器对比。仅 /health 成功不能证明已完全同步。本地 API 无登录；请忽略其他网站的无关 401。',
  },
  ar: {
    nodeQuickStart: {
      title: 'عُقدتك — أمر واحد',
      intro:
        'ثبّت Docker وشغّله. الأمر أدناه يشغّل عقدة متابعة مُتحقِّقة بتخزين دائم على شبكة الاختبار العامة. لا حاجة لمحفظة أو ضمان أو مفاتيح خاصة.',
      copy: 'نسخ',
      copied: 'تم النسخ',
      copyManual: 'حدّد الأمر وانسخه يدويًا.',
      hint:
        'التحقق: curl http://127.0.0.1:4001/health يجب أن يعيد ok:true و chainId people-public-testnet-v2-2026-09-30. السجلات: docker logs people-node. إيقاف: docker stop people-node. إعادة التشغيل: docker start people-node. تحديث الصورة: docker stop people-node && docker rm people-node ثم نفّذ الأمر مجددًا (احتفظ بحجم people-node-data).',
    },
    node02: 'استخدم الأمر في المربع أعلاه. هو مثبّت لإصدار شبكة الاختبار العامة الحالي. لا تستبدل صورًا أو عناوين شبكة أخرى.',
    manual05:
      'احفظ .env.node داخل people-node في نسخة Peoples-Blockchain وقيّد الصلاحيات. لا تفعّل ALLOW_FAUCET أو ALLOW_DEV_ENDPOINTS على عقدة عادية. لا تعرّض API HTTP للإنترنت دون حماية متفق عليها.',
    manual01:
      'البناء اليدوي يحتاج وصولًا للمستودع ومراجعة مُعتمدة. خذ CHAIN_ID وGENESIS_FAUCET_ADDRESS وBOOTSTRAP_ADDRESS وBOOTSTRAP_PEERS والرسوم من إعداد v2 على https://node.peopleblockchain.network/network. استخدم مجلد بيانات منفصلًا لشبكة أخرى.',
    verifyState:
      'بعد التشغيل نفّذ الأوامر على جهازك. /health يجب أن يعيد JSON مع ok:true. /chain/head يعرض الارتفاع المحلي — قارنه بالمستكشف العام. نجاح /health وحده لا يثبت تزامنًا كاملاً. API المحلي بلا كلمة مرور؛ تجاهل أخطاء 401 في مواقع أخرى.',
  },
};

function applyPatch(guide, lang) {
  const p = patches[lang];
  if (!p) throw new Error(`missing patch for ${lang}`);
  guide.nodeQuickStart = p.nodeQuickStart;
  const node = guide.sections.find((s) => s.id === 'node');
  node.items[1].text = p.node02;
  const manual = guide.sections.find((s) => s.id === 'node-manual');
  manual.items[0].text = p.manual01;
  manual.items[4].text = p.manual05;
  manual.code = manualCode;
  const verify = guide.sections.find((s) => s.id === 'verify');
  verify.items[0].text = p.verifyState;
  verify.code = verifyCode;
}

for (const file of fs.readdirSync(surfacesDir).filter((f) => f.startsWith('docs-') && f.endsWith('.json'))) {
  const lang = file.replace(/^docs-/, '').replace(/\.json$/, '');
  const full = path.join(surfacesDir, file);
  const guide = JSON.parse(fs.readFileSync(full, 'utf8'));
  applyPatch(guide, lang);
  fs.writeFileSync(full, JSON.stringify(guide));
  console.log('patched', file);
}

console.log('done');
