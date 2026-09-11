import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ConfigService } from './config.service';
import { GeneratedTestCase } from '../models/test-case.model';
import { PbiItem } from '../models/pbi.model';

@Injectable({
  providedIn: 'root'
})
export class GeminiAiService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private getEndpoint(model: string, apiKey: string): string {
    let selectedModel = model || 'gemini-flash-latest';
    if (['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(selectedModel)) {
      selectedModel = 'gemini-flash-latest';
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey.trim()}`;
  }

  /**
   * Tests connection to Google Gemini API
   */
  testConnection(): Observable<{ success: boolean; message: string }> {
    const { geminiApiKey, geminiModel } = this.configService.currentConfig();
    if (!geminiApiKey) {
      return of({
        success: false,
        message: 'No has ingresado la API Key de Google Gemini.'
      });
    }

    const url = this.getEndpoint(geminiModel, geminiApiKey);
    const testPayload = {
      contents: [
        {
          parts: [{ text: 'Responde {"status": "ok"} para verificar la conexión.' }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    return this.http.post<any>(url, testPayload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      map(() => ({
        success: true,
        message: `Conexión exitosa con Google Gemini (${geminiModel || 'gemini-2.5-flash'}).`
      })),
      catchError(err => {
        let msg = 'Error al verificar la conexión con Gemini.';
        if (err.status === 400 || err.status === 403) {
          msg = 'API Key de Gemini inválida o sin permisos para el modelo.';
        } else if (err.status === 404) {
          msg = `El modelo especificado (${geminiModel}) no se encuentra disponible.`;
        } else if (err.error?.error?.message) {
          msg = err.error.error.message;
        }
        return of({ success: false, message: msg });
      })
    );
  }

  /**
   * Generates comprehensive QA Test Cases based on PBI details
   */
  generateTestCases(pbi: PbiItem): Observable<GeneratedTestCase[]> {
    const { geminiApiKey, geminiModel } = this.configService.currentConfig();

    if (!geminiApiKey) {
      return throwError(() => new Error('Por favor configura tu API Key de Gemini en Parámetros del Sistema.'));
    }

    const url = this.getEndpoint(geminiModel, geminiApiKey);

    const systemPrompt = `
Eres un QA Automation Lead y Tester Senior experto en diseño de pruebas de software, ISTQB y Azure DevOps.
Tu misión es generar una suite completa y rigurosa de casos de prueba (Test Cases) para una Historia de Usuario / PBI.

REGLAS DE COBERTURA:
1. Genera entre 3 y 6 casos de prueba exhaustivos.
2. Incluye una mezcla equilibrada de:
   - Flujos positivos / Happy Path.
   - Flujos alternativos, negativos y validación de reglas de negocio / casos de borde.
   - Al menos 1 o 2 casos en formato BDD/Gherkin (Dado que, Cuando, Entonces / Given, When, Then) con "esGherkin": true.
3. Para cada caso de prueba, debes especificar:
   - "titulo": Descripción concisa, accionable y profesional.
   - "precondiciones": Estado previo necesario del sistema y datos de prueba.
   - "pasos": Arreglo de cadenas de texto con pasos ordenados y claros (ej: ["1. Acceder...", "2. Ingresar..."]).
   - "resultadoEsperado": Comportamiento exacto esperado por el sistema.
   - "esGherkin": true si los pasos y resultado siguen sintaxis Gherkin/BDD, false si es paso a paso tradicional.

DEBES RETORNAR ÚNICAMENTE UN ARREGLO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA EXACTA:
[
  {
    "titulo": "Validar redirección exitosa usando pasarela alternativa",
    "precondiciones": "La pasarela primaria está caída (HTTP 500) y el carrito posee items válidos.",
    "pasos": [
      "1. Llegar al checkout e intentar finalizar compra con pasarela primaria.",
      "2. Verificar que se despliega automáticamente la opción de pasarela alternativa.",
      "3. Completar datos válidos de tarjeta local secundaria.",
      "4. Confirmar la compra."
    ],
    "resultadoEsperado": "Se completa el checkout y se redirige con éxito a la pantalla de confirmación.",
    "esGherkin": false
  }
]
No añadas texto introductorio ni formato markdown adicional fuera del JSON.
`;

    const userPrompt = `
HISTORIA DE USUARIO / PBI A ANALIZAR:
- ID: ${pbi.id || 'N/A'}
- Título: ${pbi.title}
- Descripción:
${pbi.description || 'Sin descripción provista'}

- Criterios de Aceptación:
${pbi.acceptanceCriteria || 'Sin criterios de aceptación provistos'}
`;

    const payload = {
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.25
      }
    };

    return this.http.post<any>(url, payload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      map(res => {
        try {
          const rawText = res.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const parsed = JSON.parse(rawText);
          if (!Array.isArray(parsed)) {
            throw new Error('La respuesta del modelo no es un arreglo de casos de prueba.');
          }

          return parsed.map((tc: any, index: number) => ({
            id: 'tc-' + (index + 1) + '-' + Date.now().toString(36),
            titulo: tc.titulo || `Caso de Prueba #${index + 1}`,
            precondiciones: tc.precondiciones || '',
            pasos: Array.isArray(tc.pasos) ? tc.pasos : [tc.pasos || ''],
            resultadoEsperado: tc.resultadoEsperado || '',
            esGherkin: Boolean(tc.esGherkin),
            selected: true,
            synced: false
          }));
        } catch (parseError: any) {
          console.error('Error parseando JSON de Gemini:', parseError);
          throw new Error('No se pudo procesar la respuesta generada por Gemini.');
        }
      }),
      catchError(err => {
        let msg = 'Error al generar casos de prueba con Gemini.';
        if (err.status === 400 || err.status === 403) {
          msg = 'Error en API Key de Gemini: verifícala en Configuración.';
        } else if (err.error?.error?.message) {
          msg = err.error.error.message;
        } else if (err.message) {
          msg = err.message;
        }
        return throwError(() => new Error(msg));
      })
    );
  }
}
