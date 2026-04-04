# Gabriel Services Wiki Script (English / Español)

## Purpose
This wiki script defines bilingual content and UI behavior for the multilingual website.

---

## EN: Welcome
Gabriel Services supports logistics, administrative workflows, customer operations, and IT support. Use the language toggle to switch between English and Spanish.

## ES: Bienvenida
Gabriel Services brinda soporte en logística, procesos administrativos, operaciones de atención al cliente y soporte TI. Use el selector de idioma para cambiar entre inglés y español.

---

## EN: Common chatbot prompts
- "I need support with logistics tracking."
- "Help me contact your team."
- "Show me available services."

## ES: Prompts comunes para chatbot
- "Necesito ayuda con el seguimiento logístico."
- "Ayúdame a contactar a tu equipo."
- "Muéstrame los servicios disponibles."

---

## EN: Translation dictionary (starter)
| Key | English | Spanish |
|---|---|---|
| nav.home | Home | Inicio |
| nav.services | Services | Servicios |
| nav.contact | Contact | Contacto |
| chatbot.title | OPS AI Chatbot | Chatbot OPS AI |
| chatbot.human | I am human | Soy humano |

## ES: Notas de implementación
Persistir idioma en `localStorage` y aplicar traducciones con atributos `data-en` y `data-es` para mantener consistencia entre páginas.
