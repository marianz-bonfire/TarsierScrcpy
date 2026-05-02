<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
});

const emit = defineEmits(['update:modelValue', 'add-device']);

const dialog = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const host = ref('');
const port = ref(5555);
const isConnecting = ref(false);
const errorMessage = ref('');

const handleAddDevice = async () => {
  if (!host.value || !host.value.trim()) {
    errorMessage.value = 'Please enter device IP address';
    return;
  }

  if (!port.value || port.value < 1 || port.value > 65535) {
    errorMessage.value = 'Please enter valid port (1-65535)';
    return;
  }

  isConnecting.value = true;
  errorMessage.value = '';
  
  try {
    emit('add-device', {
      host: host.value.trim(),
      port: Number(port.value)
    });
    
    // Reset form
    host.value = '';
    port.value = 5555;
    dialog.value = false;
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to add device';
  } finally {
    isConnecting.value = false;
  }
};

import { computed } from 'vue';
</script>

<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title>Connect Wireless Device</v-card-title>
      
      <v-card-text class="pt-4">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          <strong>Setup Instructions:</strong>
          <ol class="mt-2 ml-4">
            <li>Enable USB debugging on your device</li>
            <li>Connect device via USB cable</li>
            <li>In terminal, run: <code>adb tcpip 5555</code></li>
            <li>Disconnect USB and note the device's IP address</li>
            <li>Enter IP and port below</li>
          </ol>
        </v-alert>

        <v-text-field
          v-model="host"
          label="Device IP Address"
          placeholder="e.g., 192.168.1.100"
          outlined
          density="compact"
          class="mb-3"
          @keyup.enter="handleAddDevice"
        />

        <v-text-field
          v-model.number="port"
          label="Port"
          type="number"
          outlined
          density="compact"
          :value="5555"
          min="1"
          max="65535"
        />

        <v-alert 
          v-if="errorMessage" 
          type="error" 
          variant="tonal" 
          density="compact"
          class="mt-3"
        >
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
        <v-btn 
          variant="flat" 
          color="primary" 
          @click="handleAddDevice"
          :loading="isConnecting"
        >
          Connect
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
code {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}
</style>
