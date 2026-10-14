// İlk açılış onboarding'i: "Calem'e hoş geldin" akışının gösterilip gösterilmeyeceği.
//
// Neden localStorage: bayrak senkron okunmalı ki uygulama açılırken bir karelik
// "önce canvas sonra overlay" flaşı olmasın, ve testler açılıştan önce tohumlayabilsin.
// Ayarlar (IDB) asenkron yüklendiğinden onboarding ancak ayarlar hazır olunca gösterilir
// (bkz. CanvasView) — böylece kullanıcının seçtiği profil, geç gelen kayıtla ezilmez.
import { ref } from 'vue'

const ONBOARDED_KEY = 'calem-onboarded'

const readOnboarded = (): boolean => {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    // localStorage kapalı (özel mod vb.): onboarding'i her açılışta göster.
    return false
  }
}

// Tekil durum: overlay tek yerde render edilir ama ayarlardan yeniden açılabilir.
const showWelcome = ref(false)

export function useOnboarding() {
  /** Ayarlar yüklendikten sonra çağrılır: ilk açılışsa overlay'i gösterir. */
  const maybeShow = () => {
    if (!readOnboarded()) showWelcome.value = true
  }
  /** Akış tamamlandı: bayrağı yaz, overlay'i kapat. */
  const complete = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      /* sessiz */
    }
    showWelcome.value = false
  }
  /** Ayarlardan "tanıtımı tekrar göster". */
  const reopen = () => {
    showWelcome.value = true
  }
  /** Test/teşhis: sıfırla. */
  const reset = () => {
    try {
      localStorage.removeItem(ONBOARDED_KEY)
    } catch {
      /* sessiz */
    }
    showWelcome.value = true
  }

  return { showWelcome, maybeShow, complete, reopen, reset }
}
