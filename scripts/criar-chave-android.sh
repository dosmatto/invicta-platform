#!/bin/bash
# Cria a CHAVE DE ASSINATURA do app Android — uma única vez na vida do produto.
#
# Por que um script e não o comando solto do keytool: o keytool aceita a senha
# como argumento (-storepass SENHA), e aí ela fica no histórico do shell e na
# lista de processos da máquina. Aqui a senha é lida sem eco e entregue pelo
# ambiente (-storepass:env), que nenhum `ps` mostra.
#
#   bash scripts/criar-chave-android.sh
#
# Sai com dois arquivos em android/ — ambos fora do Git (ver .gitignore):
#   invicta-coleta.jks     a chave
#   keystore.properties    onde o Gradle lê a senha na hora de assinar
#
# ⚠️ Perder o .jks OU a senha significa não poder mais atualizar o app publicado.
#    Não existe recuperação: seria preciso publicar outro app, do zero, e pedir
#    a todos que reinstalassem.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$RAIZ/android"
CHAVE="$DIR/invicta-coleta.jks"
PROPS="$DIR/keystore.properties"
ALIAS="invicta"

KEYTOOL="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}/bin/keytool"
[ -x "$KEYTOOL" ] || { echo "❌ keytool não encontrado em: $KEYTOOL"; echo "   Instale o Android Studio ou aponte JAVA_HOME para um JDK."; exit 1; }

if [ -f "$CHAVE" ]; then
  echo "✅ A chave já existe: android/invicta-coleta.jks"
  echo "   NÃO gere outra — o app publicado só aceita atualizações assinadas com esta."
  [ -f "$PROPS" ] && { echo "✅ android/keystore.properties também está no lugar. Nada a fazer."; exit 0; }
  echo "   Falta só o keystore.properties. Informe a senha da chave existente."
else
  cat <<'TXT'
──────────────────────────────────────────────────────────────────────────────
 Criando a chave de assinatura do INVICTA Coleta
──────────────────────────────────────────────────────────────────────────────
 Escolha uma senha FORTE e guarde em pelo menos dois lugares (gerenciador de
 senhas + um backup). Ela e o arquivo .jks são insubstituíveis: sem eles não é
 possível publicar nenhuma atualização do app.
TXT
fi

# -s: não ecoa a senha na tela.
read -rsp "Senha da chave: " SENHA; echo
read -rsp "Repita a senha: " SENHA2; echo
[ "$SENHA" = "$SENHA2" ] || { echo "❌ As senhas não conferem. Rode de novo."; exit 1; }
[ ${#SENHA} -ge 6 ] || { echo "❌ A senha precisa de pelo menos 6 caracteres."; exit 1; }

if [ ! -f "$CHAVE" ]; then
  # -dname preenchido aqui, sem acentos, porque o keytool interativo lida mal
  # com eles e o campo vai gravado dentro do certificado, para sempre.
  KS_SENHA="$SENHA" "$KEYTOOL" -genkeypair -v \
    -keystore "$CHAVE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass:env KS_SENHA -keypass:env KS_SENHA \
    -dname "CN=INVICTA Consultoria em Agronegocio, OU=TI, O=INVICTA, L=Cascavel, ST=PR, C=BR"
  echo "✅ Chave criada: android/invicta-coleta.jks"
fi

# 077 antes de criar: o arquivo nasce legível só pelo dono, nunca com a senha
# exposta a outros usuários da máquina.
( umask 077; cat > "$PROPS" <<PROPFIM
storeFile=invicta-coleta.jks
storePassword=$SENHA
keyAlias=$ALIAS
keyPassword=$SENHA
PROPFIM
)
echo "✅ android/keystore.properties gravado (fora do Git, só você lê)."

# A impressão digital SHA-256 é o que a Play Store mostra na página de
# assinatura — serve para conferir, um dia, que a chave é mesmo esta.
echo
echo "Impressão digital desta chave (guarde junto com o backup):"
KS_SENHA="$SENHA" "$KEYTOOL" -list -v -keystore "$CHAVE" -alias "$ALIAS" -storepass:env KS_SENHA \
  | grep -E "SHA-?256:" || true

cat <<'TXT'

──────────────────────────────────────────────────────────────────────────────
 FAÇA O BACKUP AGORA — antes de seguir
──────────────────────────────────────────────────────────────────────────────
 1. Copie android/invicta-coleta.jks para um lugar seguro (não só o OneDrive
    desta pasta: se o repositório for apagado, ele vai junto).
 2. Salve a senha no gerenciador de senhas da empresa.

 Feito isso, gere o pacote da loja:   npm run android:release
TXT
