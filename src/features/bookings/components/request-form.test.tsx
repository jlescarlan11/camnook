import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it,vi } from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/features/bookings/actions/request-booking',()=>({requestBooking:vi.fn()}));
import { RequestForm } from './request-form';
import { testMeetupPlace } from '@/features/meetups/place-fixture.test-helper';
const props={camera:'11111111-1111-4111-8111-111111111111',schedule:{pickupDate:'2099-08-24',returnDate:'2099-08-26',handoffTime:'09:00',policyVersion:'1'},summary:{cameraName:'Camera',dates:'Dates',handoffTime:'9 AM',rentalAmount:'₱900',securityDeposit:'₱1000',totalDue:'₱1900'}};
it('offers explicit saved-place selection with a coordinate-based map link',()=>{
 const html=renderToStaticMarkup(<RequestForm {...props} meetupPlaces={[testMeetupPlace]}/>);
 expect(html).toContain('Choose your meetup place');expect(html).toContain('Public mall entrance');expect(html).toContain('10.315712%2C123.885423');expect(html).not.toContain('Preferred meetup area');expect(html).not.toContain('checked=""');
});
it('distinguishes unavailable reads from no configured places',()=>{
 expect(renderToStaticMarkup(<RequestForm {...props} meetupPlaces={null}/>)).toContain('could not be loaded');
 expect(renderToStaticMarkup(<RequestForm {...props} meetupPlaces={[]}/>)).toContain('no meetup places available');
});
