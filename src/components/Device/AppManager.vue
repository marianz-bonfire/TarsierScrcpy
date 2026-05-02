<template>
  <div class="app-manager">
    <div class="info-container">
      <v-fade-transition mode="out-in">
        <div class="app-grid">
          <!-- Install App (above the list) -->
          <div class="app-install">
            <v-card class="d-flex flex-column">
              <v-card-title class="py-2 px-4 text-subtitle-1 font-weight-semibold bg-primary-lighten-5">
                Install App
              </v-card-title>
              <v-card-text class="pt-3 pb-3">
                <DeviceInstall @install-complete="handleInstallComplete" />
              </v-card-text>
            </v-card>
          </div>

          <!-- App List -->
          <div class="app-list">
            <v-card class="d-flex flex-column app-list-card">
              <v-card-title class="py-2 px-4 bg-primary-lighten-5 d-flex justify-space-between align-center">
                <span class="text-subtitle-1 font-weight-semibold">App List</span>
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  @click="refreshAppList"
                  :loading="loading"
                >
                  Refresh
                </v-btn>
              </v-card-title>

              <div class="px-4 py-2">
                <v-text-field
                  v-model="search"
                  label="Search Apps"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </div>

              <v-card-text class="flex-grow-1 pa-0 overflow-auto">
                <v-data-table
                  :headers="headers"
                  :items="apps"
                  :loading="loading"
                  :search="search"
                  :items-per-page="-1"
                  hide-default-footer
                  hover
                  fixed-header
                  class="app-table"
                >
                  <template v-slot:[slotItemAppName]="{ item }">
                    <span class="font-weight-medium">{{ item.appName }}</span>
                  </template>
                  <template v-slot:[slotItemPackageName]="{ item }">
                    <span class="text-body-2 text-medium-emphasis package-cell">{{ item.packageName }}</span>
                  </template>

                  <!-- Version Column -->
                  <template v-slot:[slotItemVersionInfo]="{ item }">
                    <div>
                      <div class="font-weight-medium">Version Code: {{ item.versionCode || 'Unknown' }}</div>
                    </div>
                  </template>

                  <!-- Actions Column -->
                  <template v-slot:[slotItemActions]="{ item }">
                    <div class="d-flex gap-2 actions-container">
                      <v-btn
                        color="primary"
                        variant="tonal"
                        size="small"
                        prepend-icon="mdi-play"
                        @click="launchApp(item)"
                      >
                        Launch
                      </v-btn>
                      <v-btn
                        color="info"
                        variant="tonal"
                        size="small"
                        prepend-icon="mdi-export"
                        @click="exportApk(item)"
                        :loading="item.exporting"
                      >
                        Export
                      </v-btn>
                      <v-btn
                        color="error"
                        variant="tonal"
                        size="small"
                        prepend-icon="mdi-delete"
                        @click="uninstallApp(item)"
                        :loading="item.uninstalling"
                      >
                        Uninstall
                      </v-btn>
                    </div>
                  </template>
                </v-data-table>
              </v-card-text>
            </v-card>
          </div>
        </div>
      </v-fade-transition>
    </div>

    <!-- Export Progress Dialog -->
    <v-dialog v-model="showExportDialog" persistent max-width="400">
      <v-card>
        <v-card-title>ExportAPK</v-card-title>
        <v-card-text>
          <div class="text-subtitle-2 mb-2">{{ exportingApp?.appName }}</div>
          <v-progress-linear
            v-if="exportProgress"
            :model-value="exportProgress"
            height="25"
            color="info"
          >
            <template v-slot:default="{ value }">
              <strong>{{ Math.ceil(value) }}%</strong>
            </template>
          </v-progress-linear>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Error Message -->
    <v-snackbar v-model="showError" :color="errorType" timeout="3000" location="top">
      {{ errorMessage }}
    </v-snackbar>

    <!-- Confirm Dialog -->
    <v-dialog v-model="showConfirmDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">
          Confirm Uninstall
        </v-card-title>
        <v-card-text>
          Are you sure you want to uninstall <strong>{{ selectedApp?.[0]?.appName }}</strong>?
          <div class="text-caption mt-2">
            Package name: {{ selectedApp?.[0]?.packageName }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="grey-darken-1"
            variant="text"
            @click="showConfirmDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            @click="confirmUninstall"
            :loading="selectedApp?.[0]?.uninstalling"
          >
            Uninstall
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import type { PackageManagerListPackagesResult } from "@yume-chan/android-bin";
import { PackageManager } from "@yume-chan/android-bin";
import { saveAs } from 'file-saver';
import { onMounted, ref, watch } from 'vue';
import client from '../Scrcpy/adb-client';
import DeviceInstall from './DeviceInstall.vue';

interface ExtendedPackageInfo extends PackageManagerListPackagesResult {
  appName: string;
  uninstalling: boolean;
  exporting: boolean;
}

const loading = ref(false);
const search = ref('');
const apps = ref<ExtendedPackageInfo[]>([]);
const packageManager = ref<PackageManager | null>(null);
const showError = ref(false);
const errorMessage = ref('');
const showConfirmDialog = ref(false);
const selectedApp = ref<ExtendedPackageInfo[]>([]);
const errorType = ref<'error' | 'success'>('error');
const showExportDialog = ref(false);
const exportProgress = ref(0);
const showInstallDialog = ref(false);
const exportingApp = ref<ExtendedPackageInfo | null>(null);

/** v-data-table slot name (dynamic binding, avoid item.xxx being treated as v-slot modifier) */
const slotItemAppName = 'item.appName';
const slotItemPackageName = 'item.packageName';
const slotItemVersionInfo = 'item.versionInfo';
const slotItemActions = 'item.actions';

const refreshAppList = async () => {
  if (!client.device || !packageManager.value) return;

  loading.value = true;
  try {
    const appList: ExtendedPackageInfo[] = [];
    
    // Use spawnAndWaitLegacy method to execute command
    const output = await client.device.subprocess.noneProtocol!.spawnWaitText([
      'pm',
      'list',
      'packages',
      '-f', // showSourceDir
      '-i', // showInstaller
      '--show-versioncode', // showVersionCode
    ]);

    // Handle output results
    const lines = output.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const pkg = PackageManager.parsePackageListItem(line);
        appList.push({
          ...pkg,
          appName: pkg.packageName.split('.').pop() || pkg.packageName,
          uninstalling: false,
          exporting: false
        });
      } catch (e) {
        console.warn('Failed to parse package info:', line, e);
      }
    }
    
    apps.value = appList;
  } catch (error) {
    console.error('Failed to get app list:', error);
    showError.value = true;
    errorMessage.value = 'Failed to get app list, please retry';
  } finally {
    loading.value = false;
  }
};

const uninstallApp = (app: ExtendedPackageInfo) => {
  selectedApp.value = [app];
  showConfirmDialog.value = true;
};

const confirmUninstall = async () => {
  if (!client.device || !packageManager.value || !selectedApp.value[0]) return;

  try {
    selectedApp.value[0].uninstalling = true;
    
    const output = await client.device.subprocess.noneProtocol!.spawnWaitText([
      'pm',
      'uninstall',
      selectedApp.value[0].packageName
    ]);

    if (output.trim() !== 'Success') {
      throw new Error(output);
    }

    await refreshAppList();
    errorType.value = 'success';
    showError.value = true;
    errorMessage.value = 'App uninstalled successfully';
    showConfirmDialog.value = false;
  } catch (error) {
    console.error('Failed to uninstall app:', error);
    errorType.value = 'error';
    showError.value = true;
    errorMessage.value = 'Failed to uninstall app, please retry';
  } finally {
    if (selectedApp.value[0]) {
      selectedApp.value[0].uninstalling = false;
    }
  }
};

const handleInstallComplete = (success: boolean, message: string) => {
  errorType.value = success ? 'success' : 'error';
  showError.value = true;
  errorMessage.value = message;
  if (success) {
    refreshAppList();
    showInstallDialog.value = false;
  }
};

const launchApp = async (app: ExtendedPackageInfo) => {
  if (!client.device) return;
  
  try {
    await client.device.subprocess.noneProtocol!.spawnWait([
      'monkey',
      '-p',
      app.packageName,
      '-c',
      'android.intent.category.LAUNCHER',
      '1'
    ]);
    
    errorType.value = 'success';
    showError.value = true;
    errorMessage.value = 'App launched successfully';
  } catch (error) {
    console.error('Failed to launch app:', error);
    errorType.value = 'error';
    showError.value = true;
    errorMessage.value = 'Failed to launch app, please retry';
  }
};

const exportApk = async (app: ExtendedPackageInfo) => {
  if (!client.device) return;
  
  app.exporting = true;
  exportingApp.value = app;
  showExportDialog.value = true;
  exportProgress.value = 0;
  
  try {
    const sourceDir = app.sourceDir;
    if (!sourceDir) {
      throw new Error('Unable to get app path');
    }

    const tempDir = '/data/local/tmp';
    const tempFile = `${tempDir}/${app.packageName}.apk`;
    
    await client.device.subprocess.noneProtocol!.spawnWait([
      'cp',
      sourceDir,
      tempFile
    ]);

    const sync = await client.device.sync();
    try {
      const stat = await sync.stat(tempFile);
      const stream = await sync.read(tempFile);
      
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      const totalSize = Number(stat.size);
      let receivedLength = 0;
      
      // eslint-disable-next-line no-constant-condition -- ReadableStreamDefaultReader until done
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        exportProgress.value = (receivedLength / totalSize) * 100;
      }
      
      const blob = new Blob(chunks as BlobPart[], { type: 'application/vnd.android.package-archive' });
      saveAs(blob, `${app.packageName}.apk`);
      
      errorType.value = 'success';
      showError.value = true;
      errorMessage.value = 'APK exported successfully';
    } finally {
      await sync.dispose();
      await client.device.subprocess.noneProtocol!.spawnWait([
        'rm',
        tempFile
      ]);
    }
  } catch (error) {
    console.error('Failed to export APK:', error);
    errorType.value = 'error';
    showError.value = true;
    errorMessage.value = 'Failed to export APK, please retry';
  } finally {
    app.exporting = false;
    exportingApp.value = null;
    showExportDialog.value = false;
    exportProgress.value = 0;
  }
};

// Listen to device connection status
watch(() => client.device, async (newDevice) => {
  if (newDevice) {
    packageManager.value = new PackageManager(newDevice);
    await refreshAppList();
  } else {
    packageManager.value = null;
    apps.value = [];
  }
});

onMounted(() => {
  if (client.device) {
    packageManager.value = new PackageManager(client.device);
    refreshAppList();
  }
});

const headers = [
  {
    title: 'App Name',
    key: 'appName',
    align: 'start' as const,
    sortable: true,
    width: '140',
  },
  {
    title: 'Package Name',
    key: 'packageName',
    align: 'start' as const,
    sortable: true,
    minWidth: '200',
  },
  {
    title: 'Version Info',
    key: 'versionInfo',
    align: 'start' as const,
    sortable: true,
    width: '150'
  },
  {
    title: 'Actions',
    key: 'actions',
    align: 'center' as const,
    sortable: false,
    width: '250',
    fixed: true
  }
];
</script>

<style scoped>
.app-manager {
  height: 100%;
  padding: 12px;
  overflow: hidden;
}

.info-container {
  height: 100%;
  max-height: 100%;
}

.app-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
  gap: 12px;
}

.app-install {
  min-width: 0;
  flex-shrink: 0;
}

.app-list {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-list-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Table container styles */
.v-card-text {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Table styles */
.app-table {
  flex: 1;
  overflow: auto;
}

:deep(.v-data-table) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.v-data-table__wrapper) {
  flex: 1;
  overflow-y: auto !important;
}

.package-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* Fixed actions column styles */
.actions-container {
  min-width: 240px;
  justify-content: flex-start;
}

:deep(.v-data-table__wrapper table) {
  table-layout: fixed;
}

/* Ensure horizontal scroll bar works properly */
:deep(.v-data-table__wrapper) {
  overflow-x: auto !important;
}

/* Other styles remain unchanged */
</style>
