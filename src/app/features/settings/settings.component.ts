import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { AzureDevOpsService } from '../../core/services/azure-devops.service';
import { GeminiAiService } from '../../core/services/gemini-ai.service';
import { AppConfig } from '../../core/models/config.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private configService = inject(ConfigService);
  private azureService = inject(AzureDevOpsService);
  private geminiService = inject(GeminiAiService);
  private router = inject(Router);

  settingsForm!: FormGroup;
  showPat = signal<boolean>(false);
  showApiKey = signal<boolean>(false);

  // States
  isTestingAzure = signal<boolean>(false);
  isTestingGemini = signal<boolean>(false);
  saveSuccess = signal<boolean>(false);

  azureStatus = signal<{ tested: boolean; success: boolean; message: string }>({
    tested: false,
    success: false,
    message: ''
  });

  geminiStatus = signal<{ tested: boolean; success: boolean; message: string }>({
    tested: false,
    success: false,
    message: ''
  });

  availableModels = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Ultrarrápido y Preciso - Recomendado)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Alta Velocidad)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Razonamiento Complejo)' }
  ];

  ngOnInit(): void {
    const config = this.configService.currentConfig();
    this.settingsForm = this.fb.group({
      azureOrg: [config.azureOrg || '', Validators.required],
      azureProject: [config.azureProject || '', Validators.required],
      azurePat: [config.azurePat || '', Validators.required],
      geminiApiKey: [config.geminiApiKey || '', Validators.required],
      geminiModel: [config.geminiModel || 'gemini-2.5-flash', Validators.required]
    });
  }

  togglePatVisibility(): void {
    this.showPat.update(v => !v);
  }

  toggleApiKeyVisibility(): void {
    this.showApiKey.update(v => !v);
  }

  saveSettings(): void {
    const formValues: AppConfig = this.settingsForm.value;
    this.configService.saveConfig(formValues);
    this.saveSuccess.set(true);

    setTimeout(() => {
      this.saveSuccess.set(false);
    }, 3000);
  }

  testAllConnections(): void {
    this.saveSettings();
    this.testAzureConnection();
    this.testGeminiConnection();
  }

  testAzureConnection(): void {
    this.isTestingAzure.set(true);
    this.azureService.testConnection().subscribe({
      next: res => {
        this.azureStatus.set({
          tested: true,
          success: res.success,
          message: res.message
        });
        this.isTestingAzure.set(false);
      },
      error: () => {
        this.azureStatus.set({
          tested: true,
          success: false,
          message: 'Error inesperado al contactar Azure DevOps.'
        });
        this.isTestingAzure.set(false);
      }
    });
  }

  testGeminiConnection(): void {
    this.isTestingGemini.set(true);
    this.geminiService.testConnection().subscribe({
      next: res => {
        this.geminiStatus.set({
          tested: true,
          success: res.success,
          message: res.message
        });
        this.isTestingGemini.set(false);
      },
      error: () => {
        this.geminiStatus.set({
          tested: true,
          success: false,
          message: 'Error inesperado al contactar Google Gemini API.'
        });
        this.isTestingGemini.set(false);
      }
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
