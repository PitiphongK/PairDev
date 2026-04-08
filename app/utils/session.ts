export function generateSessionName(): string {                                                                                                
  const now = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']                                                                        
  const day = days[now.getDay()]
  const hours = now.getHours()                                                                                                          
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'                                                                                                
  const hour12 = hours % 12 || 12                                                                                                       
  
  return `${day} ${hour12}:${minutes} ${ampm}`                                                                                          
}